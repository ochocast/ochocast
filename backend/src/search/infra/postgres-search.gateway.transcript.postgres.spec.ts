import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { parseSearchQuery } from '../domain/query-parser';
import { TextPart, TranscriptResult, Viewer } from '../domain/search.types';
import {
  FixtureIds,
  loadSearchFixture,
  openSearchTestDatabase,
} from '../testing/search-fixture';
import { PostgresSearchGateway } from './postgres-search.gateway';

const integration = process.env.SEARCH_TEST_DATABASE_URL
  ? describe
  : describe.skip;

const joined = (parts: TextPart[]) => parts.map((part) => part.text).join('');

integration('PostgresSearchGateway.transcript (fixture of annexe A)', () => {
  let db: DataSource;
  let ids: FixtureIds;
  let gateway: PostgresSearchGateway;
  let user: Viewer;
  let admin: Viewer;

  beforeAll(async () => {
    db = await openSearchTestDatabase(process.env.SEARCH_TEST_DATABASE_URL!);
    ids = await loadSearchFixture(db);
    const [{ id }] = await db.query(
      `SELECT id FROM user_entity WHERE username = 'demo'`,
    );
    user = { userId: id, isAdmin: false };
    admin = { userId: id, isAdmin: true };
    gateway = new PostgresSearchGateway(db);
  });
  afterAll(async () => {
    await db?.destroy();
  });

  const transcript = (
    videoId: string,
    q: string | null = null,
    viewer: Viewer = user,
  ): Promise<TranscriptResult | null> =>
    gateway.transcript(videoId, q ? parseSearchQuery(q) : null, viewer);

  /** Runs `run` with the video row changed, then puts it back. */
  async function withVideo(
    videoId: string,
    changes: Record<string, string | boolean | null>,
    run: () => Promise<void>,
  ): Promise<void> {
    const columns = Object.keys(changes);
    const [before] = await db.query(
      `SELECT ${columns.map((c) => `"${c}"`).join(', ')} FROM video_entity WHERE id = $1`,
      [videoId],
    );
    const set = (values: Record<string, unknown>) =>
      db.query(
        `UPDATE video_entity SET ${columns
          .map((c, i) => `"${c}" = $${i + 2}`)
          .join(', ')} WHERE id = $1`,
        [videoId, ...columns.map((c) => values[c])],
      );
    await set(changes);
    try {
      await run();
    } finally {
      await set(before);
    }
  }

  it('returns segments with matches for kubernetes', async () => {
    const result = await transcript(ids.k8s, 'kubernetes');

    expect(result).toMatchObject({
      videoId: ids.k8s,
      source: 'auto',
      status: 'ready',
    });
    expect(result!.segments).toHaveLength(11);
    expect(result!.matches).toEqual([1, 5, 10]);
    expect(result!.segments[1].parts).toEqual([
      { text: 'On a choisi ', hit: false },
      { text: 'Kubernetes', hit: true },
      {
        text: ' parce qu’on voulait redéployer sans couper le service.',
        hit: false,
      },
    ]);
    expect(result!.segments[0]).toMatchObject({ start: 12, end: 95 });
    // Segments the query does not match stay in one plain part.
    expect(result!.segments[0].parts).toEqual([
      {
        text: 'Bonjour à tous, merci d’être venus à cette conférence sur la mise en production.',
        hit: false,
      },
    ]);
  });

  it('returns plain parts without q', async () => {
    for (const q of [null, '', '   ']) {
      const result = await transcript(ids.k8s, q);
      expect(result!.status).toBe('ready');
      expect(result!.segments).toHaveLength(11);
      expect(result!.matches).toEqual([]);
      for (const segment of result!.segments) {
        expect(segment.parts).toHaveLength(1);
        expect(segment.parts[0].hit).toBe(false);
      }
    }
  });

  it('lists the segments in order, with the start and end of each cue', async () => {
    const result = await transcript(ids.k8s);
    const starts = result!.segments.map((s) => s.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(result!.segments[0].start).toBe(12);
    expect(result!.segments[10].end).toBe(2712);
  });

  it('keeps fractional starts as numbers', async () => {
    await db.query(
      `UPDATE video_transcript_segment SET start_s = 12.5, end_s = 94.25
         WHERE video_id = $1 AND position = 0`,
      [ids.k8s],
    );
    try {
      const [first] = (await transcript(ids.k8s))!.segments;
      expect(first.start).toBe(12.5);
      expect(first.end).toBe(94.25);
    } finally {
      await db.query(
        `UPDATE video_transcript_segment SET start_s = 12, end_s = 95
           WHERE video_id = $1 AND position = 0`,
        [ids.k8s],
      );
    }
  });

  it('applies the analysis of /api/search: phrase, stemming, accents, OR', async () => {
    const phrase = await transcript(ids.rgpd, '"données personnelles"');
    expect(phrase!.matches.length).toBeGreaterThan(0);
    for (const index of phrase!.matches) {
      expect(phrase!.segments[index].parts.some((part) => part.hit)).toBe(true);
    }
    const either = await transcript(ids.k8s, 'kubernetes OR talos');
    expect(either!.matches).toEqual([1, 2, 5, 10]);
    const accents = await transcript(ids.k8s, 'redeployer');
    expect(accents!.matches).toEqual([1]);
  });

  it('does not apply exclusions per segment', async () => {
    const result = await transcript(ids.k8s, 'kubernetes -pod');
    expect(result!.matches).toEqual([1, 5, 10]);
  });

  it('returns plain parts when the query has only stop words or exclusions', async () => {
    for (const q of ['le', 'le la', '-kubernetes', 'le -kubernetes']) {
      const result = await transcript(ids.k8s, q);
      expect(result!.status).toBe('ready');
      expect(result!.segments).toHaveLength(11);
      expect(result!.matches).toEqual([]);
      expect(
        result!.segments.every((s) => s.parts.every((part) => !part.hit)),
      ).toBe(true);
    }
  });

  it('returns no match for a query that finds nothing', async () => {
    const result = await transcript(ids.k8s, 'zzzzinexistant');
    expect(result!.status).toBe('ready');
    expect(result!.matches).toEqual([]);
  });

  it('answers hostile input without failing', async () => {
    for (const q of ['a & b | !c :*', "'; DROP TABLE x; --", '"open']) {
      const result = await transcript(ids.k8s, q);
      expect(result!.status).toBe('ready');
      expect(Array.isArray(result!.matches)).toBe(true);
    }
  });

  it('joins the parts of every segment back into its text', async () => {
    const rows: { position: number; text: string }[] = await db.query(
      `SELECT position, text FROM video_transcript_segment WHERE video_id = $1 ORDER BY position`,
      [ids.k8s],
    );
    // Markup and the highlight markers stay literal text.
    await db.query(
      `UPDATE video_transcript_segment SET text = $2 WHERE video_id = $1 AND position = 1`,
      [ids.k8s, 'On a choisi <b>Kubernetes</b> & "co", pas <i>test</i>.'],
    );
    try {
      for (const q of ['kubernetes', 'test', 'redéployer', '']) {
        const result = await transcript(ids.k8s, q);
        const expected = (
          await db.query(
            `SELECT text FROM video_transcript_segment WHERE video_id = $1 ORDER BY position`,
            [ids.k8s],
          )
        ).map((r: { text: string }) => r.text);
        expect(result!.segments.map((s) => joined(s.parts))).toEqual(expected);
      }
      const result = await transcript(ids.k8s, 'kubernetes');
      expect(result!.segments[1].parts).toEqual([
        { text: 'On a choisi <b>', hit: false },
        { text: 'Kubernetes', hit: true },
        { text: '</b> & "co", pas <i>test</i>.', hit: false },
      ]);
    } finally {
      await db.query(
        `UPDATE video_transcript_segment SET text = $3 WHERE video_id = $1 AND position = $2`,
        [ids.k8s, 1, rows[1].text],
      );
    }
  });

  it('is pending while a subtitle is not indexed', async () => {
    await withVideo(
      ids.k8s,
      { subtitle_id: 'subtitle-auto-not-indexed.vtt' },
      async () => {
        expect(await transcript(ids.k8s, 'kubernetes')).toEqual({
          videoId: ids.k8s,
          source: 'auto',
          status: 'pending',
          segments: [],
          matches: [],
        });
      },
    );
  });

  it('is pending when the index is for an older subtitle', async () => {
    await withVideo(
      ids.k8s,
      { subtitle_id: `subtitle-${ids.k8s}.vtt` },
      async () => {
        const result = await transcript(ids.k8s);
        expect(result).toMatchObject({
          status: 'pending',
          source: 'provided',
          segments: [],
          matches: [],
        });
      },
    );
  });

  it('is pending while the transcription runs', async () => {
    for (const status of ['pending', 'processing']) {
      await withVideo(
        ids.k8s,
        { subtitle_id: null, transcription_status: status },
        async () => {
          expect(await transcript(ids.k8s, 'kubernetes')).toEqual({
            videoId: ids.k8s,
            source: 'auto',
            status: 'pending',
            segments: [],
            matches: [],
          });
        },
      );
    }
  });

  it('is none without subtitle', async () => {
    for (const subtitle of [null, '']) {
      await withVideo(
        ids.k8s,
        { subtitle_id: subtitle, transcription_status: 'waiting_audio' },
        async () => {
          expect(await transcript(ids.k8s, 'kubernetes')).toEqual({
            videoId: ids.k8s,
            source: 'auto',
            status: 'none',
            segments: [],
            matches: [],
          });
        },
      );
    }
    await withVideo(
      ids.k8s,
      { subtitle_id: null, transcription_status: 'failed' },
      async () => {
        expect((await transcript(ids.k8s))!.status).toBe('none');
      },
    );
  });

  it('reports the source of the indexed subtitle', async () => {
    const key = `subtitle-${ids.logique}.vtt`;
    await db.query(
      `UPDATE video_transcript SET subtitle_key = $2, source = 'provided' WHERE video_id = $1`,
      [ids.logique, key],
    );
    try {
      await withVideo(ids.logique, { subtitle_id: key }, async () => {
        const result = await transcript(ids.logique);
        expect(result).toMatchObject({ status: 'ready', source: 'provided' });
        expect(result!.segments.length).toBeGreaterThan(0);
      });
    } finally {
      await db.query(
        `UPDATE video_transcript SET subtitle_key = $2, source = 'auto' WHERE video_id = $1`,
        [ids.logique, `subtitle-auto-${ids.logique}.vtt`],
      );
    }
  });

  it('derives the source of a pending subtitle from its key', async () => {
    await withVideo(
      ids.logique,
      { subtitle_id: 'subtitle-auto-x.vtt' },
      async () => {
        expect((await transcript(ids.logique))!.source).toBe('auto');
      },
    );
    await withVideo(
      ids.logique,
      { subtitle_id: 'subtitle-x.vtt' },
      async () => {
        expect((await transcript(ids.logique))!.source).toBe('provided');
      },
    );
  });

  it('is pending when the transcript row is missing', async () => {
    const [saved] = await db.query(
      `SELECT * FROM video_transcript WHERE video_id = $1`,
      [ids.sport],
    );
    await db.query(`DELETE FROM video_transcript WHERE video_id = $1`, [
      ids.sport,
    ]);
    try {
      expect(await transcript(ids.sport)).toMatchObject({
        status: 'pending',
        segments: [],
        matches: [],
      });
    } finally {
      await db.query(
        `INSERT INTO video_transcript (video_id, subtitle_key, source, language, segment_count, tsv_fr, tsv_exact, indexed_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          saved.video_id,
          saved.subtitle_key,
          saved.source,
          saved.language,
          saved.segment_count,
          saved.tsv_fr,
          saved.tsv_exact,
          saved.indexed_at,
        ],
      );
    }
  });

  describe('archived videos', () => {
    beforeAll(async () => {
      await db.query(`UPDATE video_entity SET archived = true WHERE id = $1`, [
        ids.logique,
      ]);
    });
    afterAll(async () => {
      await db.query(`UPDATE video_entity SET archived = false WHERE id = $1`, [
        ids.logique,
      ]);
    });

    it('returns null for a non-admin', async () => {
      expect(await transcript(ids.logique)).toBeNull();
      expect(await transcript(ids.logique, 'logique')).toBeNull();
    });

    it('returns the transcript to an admin', async () => {
      const result = await transcript(ids.logique, null, admin);
      expect(result).toMatchObject({
        videoId: ids.logique,
        status: 'ready',
      });
      expect(result!.segments.length).toBeGreaterThan(0);
    });
  });

  it('returns null for an unknown id', async () => {
    expect(await transcript(randomUUID())).toBeNull();
    expect(await transcript(randomUUID(), 'kubernetes', admin)).toBeNull();
  });

  it.each(['not-a-uuid', '', '1', "'; DROP TABLE video_entity; --", '%00'])(
    'returns null for the id %p, which is not a UUID',
    async (id) => {
      expect(await transcript(id, 'kubernetes')).toBeNull();
      expect(await transcript(id, null, admin)).toBeNull();
    },
  );

  it('accepts an upper-case UUID', async () => {
    const result = (await transcript(ids.k8s.toUpperCase()))!;
    expect(result.status).toBe('ready');
    // The id of the database, not an echo of the request.
    expect(result.videoId).toBe(ids.k8s);
    expect(result.videoId).toBe(ids.k8s.toLowerCase());
  });
});
