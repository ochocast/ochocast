import { Inject, Injectable, Logger } from '@nestjs/common';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DataSource, EntityManager } from 'typeorm';
import { parseWebVtt } from '../domain/webvtt-parser';

export type IndexOutcome =
  | 'indexed'
  | 'unchanged'
  | 'cleared'
  | 'not_ready'
  | 'failed';

// Dedicated advisory lock namespace; the second key is the video.
const LOCK_NAMESPACE = 1794470400;
// Current upload limit; a larger subtitle file is not indexed.
const MAX_SUBTITLE_BYTES = 4 * 1024 ** 2;
const INSERT_BATCH_SIZE = 1000;
const LANGUAGE = 'fr';
const REINDEX_PAGE_SIZE = 20;

export interface ReindexSummary {
  indexed: number;
  cleared: number;
  failed: number;
  unchanged: number;
}

// Both sets only ever look at `video_entity` and `video_transcript`; the
// per-video work (and its re-check under the lock) stays in `indexVideo`.
const TO_INDEX = `
  v.subtitle_id IS NOT NULL AND v.subtitle_id <> ''
  AND v.transcoding_status = 'ready'
  AND NOT EXISTS (
    SELECT 1 FROM video_transcript t
    WHERE t.video_id = v.id AND t.subtitle_key = v.subtitle_id
  )`;
const TO_CLEAN = `
  (v.subtitle_id IS NULL OR v.subtitle_id = '')
  AND EXISTS (SELECT 1 FROM video_transcript t WHERE t.video_id = v.id)`;

// Design 6.3 / section 12: search configurations are looked up by language.
const SEARCH_CONFIGS = {
  fr: { stem: 'ochocast_fr', exact: 'ochocast_exact' },
} as const;

@Injectable()
export class TranscriptIndexer {
  private readonly logger = new Logger(TranscriptIndexer.name);

  constructor(
    private readonly db: DataSource,
    @Inject('s3Client') private readonly s3: S3Client,
  ) {}

  /**
   * Brings the search tables of one video in line with its `subtitle_id`.
   * Never throws: a failure is logged, nothing is written and the previous
   * index stays in place.
   */
  async indexVideo(videoId: string): Promise<IndexOutcome> {
    let key: string | null = null;
    try {
      return await this.db.transaction(async (tx) => {
        // Held until commit: a concurrent call waits here, then sees the new key.
        await tx.query(`SELECT pg_advisory_xact_lock($1, hashtext($2::text))`, [
          LOCK_NAMESPACE,
          videoId,
        ]);

        const [video] = await tx.query(
          `SELECT subtitle_id, transcoding_status FROM video_entity WHERE id = $1`,
          [videoId],
        );
        if (!video) return 'unchanged';
        const [transcript] = await tx.query(
          `SELECT subtitle_key FROM video_transcript WHERE video_id = $1`,
          [videoId],
        );

        const subtitleId: string | null = video.subtitle_id;
        if (!subtitleId) {
          const [, deleted] = await tx.query(
            `DELETE FROM video_transcript WHERE video_id = $1`,
            [videoId],
          );
          const [, deletedSegments] = await tx.query(
            `DELETE FROM video_transcript_segment WHERE video_id = $1`,
            [videoId],
          );
          return deleted + deletedSegments > 0 ? 'cleared' : 'unchanged';
        }
        if (video.transcoding_status !== 'ready') return 'not_ready';
        if (transcript?.subtitle_key === subtitleId) return 'unchanged';

        key = subtitleId;
        const cues = parseWebVtt(await this.readSubtitle(subtitleId));
        if (cues.length === 0) throw new Error('The subtitle has no cue');
        await this.write(tx, videoId, subtitleId, cues);
        return 'indexed';
      });
    } catch (error) {
      this.logger.error(
        `Cannot index the subtitle of video ${videoId} (key ${key ?? 'unknown'}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 'failed';
    }
  }

  /**
   * Resumes after an incident: indexes the ready videos whose subtitle is not
   * indexed (most recent first), then clears the videos that lost theirs.
   * Every video goes through `indexVideo`, one at a time, so a slow read never
   * holds more than one pooled connection.
   */
  async reindexAll(): Promise<ReindexSummary> {
    const summary: ReindexSummary = {
      indexed: 0,
      cleared: 0,
      failed: 0,
      unchanged: 0,
    };
    for (const condition of [TO_INDEX, TO_CLEAN]) {
      for await (const videoId of this.pendingVideos(condition)) {
        const outcome = await this.indexVideo(videoId);
        if (outcome === 'indexed') summary.indexed++;
        else if (outcome === 'cleared') summary.cleared++;
        else if (outcome === 'failed') summary.failed++;
        else summary.unchanged++;
      }
    }
    return summary;
  }

  /**
   * Keyset pagination on ("createdAt", id): a video that keeps failing stays
   * pending, so "the first 20 still pending" would select it forever.
   * "createdAt" travels as text to keep its microseconds.
   */
  private async *pendingVideos(condition: string): AsyncGenerator<string> {
    let after: { createdAt: string; id: string } | null = null;
    for (;;) {
      const page: { id: string; created_at: string }[] = await this.db.query(
        `SELECT v.id, v."createdAt"::text AS created_at
         FROM video_entity v
         WHERE (${condition})
           AND ($1::text IS NULL OR (v."createdAt", v.id) < ($1::timestamp, $2::uuid))
         ORDER BY v."createdAt" DESC, v.id DESC
         LIMIT ${REINDEX_PAGE_SIZE}`,
        [after?.createdAt ?? null, after?.id ?? null],
      );
      for (const row of page) yield row.id;
      if (page.length < REINDEX_PAGE_SIZE) return;
      const last = page[page.length - 1];
      after = { createdAt: last.created_at, id: last.id };
    }
  }

  private async readSubtitle(key: string): Promise<string> {
    const response = await this.s3.send(
      new GetObjectCommand({
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: key,
      }),
    );
    if ((response.ContentLength ?? 0) > MAX_SUBTITLE_BYTES) {
      throw new Error(`The subtitle file exceeds ${MAX_SUBTITLE_BYTES} bytes`);
    }
    if (!response.Body) throw new Error('The subtitle file has no body');
    const bytes = await response.Body.transformToByteArray();
    if (bytes.byteLength > MAX_SUBTITLE_BYTES) {
      throw new Error(`The subtitle file exceeds ${MAX_SUBTITLE_BYTES} bytes`);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }

  private async write(
    tx: EntityManager,
    videoId: string,
    subtitleKey: string,
    cues: ReturnType<typeof parseWebVtt>,
  ): Promise<void> {
    await tx.query(`DELETE FROM video_transcript_segment WHERE video_id = $1`, [
      videoId,
    ]);
    for (let from = 0; from < cues.length; from += INSERT_BATCH_SIZE) {
      const batch = cues.slice(from, from + INSERT_BATCH_SIZE);
      await tx.query(
        `INSERT INTO video_transcript_segment (video_id, position, start_s, end_s, text)
         SELECT $1, position, start_s, end_s, text
         FROM unnest($2::int[], $3::real[], $4::real[], $5::text[]) AS s(position, start_s, end_s, text)`,
        [
          videoId,
          batch.map((_, i) => from + i),
          batch.map((cue) => cue.start),
          batch.map((cue) => cue.end),
          batch.map((cue) => cue.text),
        ],
      );
    }

    const config = SEARCH_CONFIGS[LANGUAGE];
    const source = subtitleKey.startsWith('subtitle-auto-')
      ? 'auto'
      : 'provided';
    await tx.query(
      `INSERT INTO video_transcript (video_id, subtitle_key, source, language, segment_count, tsv_fr, tsv_exact)
       VALUES ($1, $2, $3, $4, $5,
               setweight(to_tsvector('${config.stem}', $6), 'D'),
               to_tsvector('${config.exact}', $6))
       ON CONFLICT (video_id) DO UPDATE SET
         subtitle_key = EXCLUDED.subtitle_key,
         source = EXCLUDED.source,
         language = EXCLUDED.language,
         segment_count = EXCLUDED.segment_count,
         tsv_fr = EXCLUDED.tsv_fr,
         tsv_exact = EXCLUDED.tsv_exact,
         indexed_at = now()`,
      [
        videoId,
        subtitleKey,
        source,
        LANGUAGE,
        cues.length,
        cues.map((cue) => cue.text).join(' '),
      ],
    );
  }
}
