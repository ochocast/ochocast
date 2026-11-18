import { Logger } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { DataSource } from 'typeorm';
import { toWebVtt } from '../../transcription/webvtt';
import {
  FixtureIds,
  fixtureVtt,
  loadSearchFixture,
  openSearchTestDatabase,
} from '../testing/search-fixture';
import { TranscriptIndexer } from './transcript-indexer';

const integration = process.env.SEARCH_TEST_DATABASE_URL
  ? describe
  : describe.skip;

const MAX_BYTES = 4 * 1024 ** 2;

integration('TranscriptIndexer (PostgreSQL)', () => {
  let db: DataSource;
  let ids: FixtureIds;
  let indexer: TranscriptIndexer;
  const objects = new Map<string, string>();

  const send = jest.fn(async (command: { input: { Key: string } }) => {
    const text = objects.get(command.input.Key);
    if (text === undefined) {
      throw Object.assign(new Error('The specified key does not exist.'), {
        name: 'NoSuchKey',
      });
    }
    return {
      ContentLength: Buffer.byteLength(text),
      Body: {
        transformToByteArray: async () => new Uint8Array(Buffer.from(text)),
      },
    };
  });
  const s3 = { send } as unknown as S3Client;

  const autoKey = (id: string) => `subtitle-auto-${id}.vtt`;
  const segmentCount = async (id: string): Promise<number> => {
    const [{ count }] = await db.query(
      `SELECT count(*)::int AS count FROM video_transcript_segment WHERE video_id = $1`,
      [id],
    );
    return count;
  };
  const transcriptRows = (id: string) =>
    db.query(`SELECT * FROM video_transcript WHERE video_id = $1`, [id]);
  /** Puts the video in a state where its subtitle is not indexed yet. */
  const unindex = async (id: string) => {
    await db.query(`DELETE FROM video_transcript_segment WHERE video_id = $1`, [
      id,
    ]);
    await db.query(`DELETE FROM video_transcript WHERE video_id = $1`, [id]);
  };
  const setVideo = (id: string, subtitleId: string | null, status = 'ready') =>
    db.query(
      `UPDATE video_entity SET subtitle_id = $2, transcoding_status = $3 WHERE id = $1`,
      [id, subtitleId, status],
    );
  const silenceErrors = () =>
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

  beforeAll(async () => {
    db = await openSearchTestDatabase(process.env.SEARCH_TEST_DATABASE_URL!);
    ids = await loadSearchFixture(db);
    indexer = new TranscriptIndexer(db, s3);
  });
  afterAll(async () => {
    await db?.destroy();
  });
  beforeEach(() => {
    send.mockClear();
    objects.clear();
  });

  it('indexes a new subtitle', async () => {
    await setVideo(ids.k8s, autoKey(ids.k8s));
    await unindex(ids.k8s);
    objects.set(autoKey(ids.k8s), fixtureVtt('k8s'));

    await expect(indexer.indexVideo(ids.k8s)).resolves.toBe('indexed');

    expect(await segmentCount(ids.k8s)).toBe(11);
    const [row] = await transcriptRows(ids.k8s);
    expect(row.source).toBe('auto');
    expect(row.segment_count).toBe(11);
    expect(row.subtitle_key).toBe(autoKey(ids.k8s));
    expect(row.language).toBe('fr');
    const [{ matches }] = await db.query(
      `SELECT tsv_fr @@ plainto_tsquery('ochocast_fr', 'kubernetes') AS matches
       FROM video_transcript WHERE video_id = $1`,
      [ids.k8s],
    );
    expect(matches).toBe(true);
    const [first] = await db.query(
      `SELECT position, start_s, end_s, text FROM video_transcript_segment
       WHERE video_id = $1 ORDER BY position LIMIT 1`,
      [ids.k8s],
    );
    expect(first).toMatchObject({ position: 0, start_s: 12, end_s: 95 });
  });

  it('is unchanged when the key is already indexed', async () => {
    await setVideo(ids.rgpd, autoKey(ids.rgpd));
    const [before] = await transcriptRows(ids.rgpd);

    await expect(indexer.indexVideo(ids.rgpd)).resolves.toBe('unchanged');

    const [after] = await transcriptRows(ids.rgpd);
    expect(after.indexed_at).toEqual(before.indexed_at);
    expect(await segmentCount(ids.rgpd)).toBe(9);
    expect(send).not.toHaveBeenCalled();
  });

  it('clears when subtitle_id is emptied', async () => {
    await setVideo(ids.sport, '');

    await expect(indexer.indexVideo(ids.sport)).resolves.toBe('cleared');

    expect(await segmentCount(ids.sport)).toBe(0);
    expect(await transcriptRows(ids.sport)).toHaveLength(0);
    // Nothing left to delete the second time.
    await expect(indexer.indexVideo(ids.sport)).resolves.toBe('unchanged');
  });

  it('does nothing while transcoding is pending', async () => {
    await setVideo(ids.logique, 'subtitle-new.vtt', 'pending');
    objects.set('subtitle-new.vtt', fixtureVtt('logique'));

    await expect(indexer.indexVideo(ids.logique)).resolves.toBe('not_ready');

    // The previous index stays in place.
    expect(await segmentCount(ids.logique)).toBe(7);
    const [row] = await transcriptRows(ids.logique);
    expect(row.subtitle_key).toBe(autoKey(ids.logique));
  });

  it('writes nothing and logs an error for an unreadable file', async () => {
    await setVideo(ids.ffmpeg, 'subtitle-missing.vtt');
    const error = silenceErrors();
    try {
      await expect(indexer.indexVideo(ids.ffmpeg)).resolves.toBe('failed');

      expect(error).toHaveBeenCalledWith(expect.stringContaining(ids.ffmpeg));
      expect(await segmentCount(ids.ffmpeg)).toBe(8);
      const [row] = await transcriptRows(ids.ffmpeg);
      expect(row.subtitle_key).toBe(autoKey(ids.ffmpeg));

      // A file that parses to zero cues is a failure too.
      error.mockClear();
      await setVideo(ids.ffmpeg, 'subtitle-empty.vtt');
      objects.set('subtitle-empty.vtt', 'WEBVTT\n\n');
      await expect(indexer.indexVideo(ids.ffmpeg)).resolves.toBe('failed');
      expect(error).toHaveBeenCalledWith(expect.stringContaining(ids.ffmpeg));
      expect(await segmentCount(ids.ffmpeg)).toBe(8);
    } finally {
      error.mockRestore();
    }
  });

  it('reindexes when the key changes', async () => {
    const key = `subtitle-${ids.pgsearch}.vtt`;
    await setVideo(ids.pgsearch, key);
    objects.set(
      key,
      toWebVtt([
        { start: 0, end: 4, text: 'Premier passage remplacé.' },
        { start: 4, end: 9, text: 'Second passage remplacé.' },
      ]),
    );

    await expect(indexer.indexVideo(ids.pgsearch)).resolves.toBe('indexed');

    expect(await segmentCount(ids.pgsearch)).toBe(2);
    const [row] = await transcriptRows(ids.pgsearch);
    expect(row.source).toBe('provided');
    expect(row.subtitle_key).toBe(key);
    expect(row.segment_count).toBe(2);
    const segments = await db.query(
      `SELECT position, text FROM video_transcript_segment WHERE video_id = $1 ORDER BY position`,
      [ids.pgsearch],
    );
    expect(segments.map((s: { text: string }) => s.text)).toEqual([
      'Premier passage remplacé.',
      'Second passage remplacé.',
    ]);
  });

  it('serialises concurrent indexing', async () => {
    await setVideo(ids.k8s, autoKey(ids.k8s));
    await unindex(ids.k8s);
    objects.set(autoKey(ids.k8s), fixtureVtt('k8s'));

    const outcomes = await Promise.all([
      indexer.indexVideo(ids.k8s),
      indexer.indexVideo(ids.k8s),
    ]);

    expect([...outcomes].sort()).toEqual(['indexed', 'unchanged']);
    expect(await segmentCount(ids.k8s)).toBe(11);
  });

  it('indexes a transcript longer than 16383 words', async () => {
    const words = [
      'le',
      'cours',
      'présente',
      'une',
      'méthode',
      'simple',
      'pour',
      'analyser',
      'des',
      'données',
      'de',
      'terrain',
    ];
    const cues = Array.from({ length: 1800 }, (_, i) => ({
      start: i * 4,
      end: i * 4 + 4,
      text:
        i === 1799
          ? [...words.slice(0, 11), 'zygomatique'].join(' ')
          : words.map((_, j) => words[(i + j) % words.length]).join(' '),
    }));
    const key = `subtitle-long-${ids.pgsearch}.vtt`;
    await setVideo(ids.pgsearch, key);
    objects.set(key, toWebVtt(cues)!);

    await expect(indexer.indexVideo(ids.pgsearch)).resolves.toBe('indexed');

    expect(await segmentCount(ids.pgsearch)).toBe(1800);
    const [{ matches }] = await db.query(
      `SELECT tsv_fr @@ plainto_tsquery('ochocast_fr', 'zygomatique') AS matches
       FROM video_transcript WHERE video_id = $1`,
      [ids.pgsearch],
    );
    expect(matches).toBe(true);
  });

  it('refuses a file over 4 MB', async () => {
    await setVideo(ids.sport, 'subtitle-huge.vtt');
    await unindex(ids.sport);
    objects.set(
      'subtitle-huge.vtt',
      `WEBVTT\n\n00:00:00.000 --> 00:00:04.000\n${'a'.repeat(MAX_BYTES)}\n`,
    );
    const error = silenceErrors();
    try {
      await expect(indexer.indexVideo(ids.sport)).resolves.toBe('failed');

      expect(error).toHaveBeenCalledWith(expect.stringContaining(ids.sport));
      expect(await segmentCount(ids.sport)).toBe(0);
      expect(await transcriptRows(ids.sport)).toHaveLength(0);
    } finally {
      error.mockRestore();
    }
  });
});
