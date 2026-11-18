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
