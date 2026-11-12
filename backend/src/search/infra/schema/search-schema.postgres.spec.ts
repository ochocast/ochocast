import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { AddContentSearch1794470400000 } from '../../../migrations/1794470400000-AddContentSearch';
import { openSearchTestDatabase } from '../../testing/search-fixture';
import { ensureSearchSchema } from './search-schema';

const integration = process.env.SEARCH_TEST_DATABASE_URL
  ? describe
  : describe.skip;

async function insertVideo(db: DataSource): Promise<string> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO video_entity (id, media_id, miniature_id, title, description, external_speakers, views, archived)
     VALUES ($1, 'master.m3u8', 'image.jpg', 'Schema test', '', '', 0, false)`,
    [id],
  );
  return id;
}

integration('content search schema (dedicated test database)', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await openSearchTestDatabase(process.env.SEARCH_TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('creates the schema twice without error', async () => {
    await ensureSearchSchema(db);
    await ensureSearchSchema(db);
    const [row] = await db.query(
      `SELECT to_tsvector('ochocast_fr', 'l’école des conférences')::text AS v`,
    );
    expect(row.v).toBe(`'conferent':4 'ecol':2`);
  });

  it('computes generated tsvectors on segments', async () => {
    const videoId = await insertVideo(db);
    await db.query(
      `INSERT INTO video_transcript_segment (video_id, position, start_s, end_s, text)
       VALUES ($1, 0, 0, 1, 'Kubernetes redémarre le pod')`,
      [videoId],
    );
    const [row] = await db.query(
      `SELECT tsv_fr::text AS fr, tsv_exact::text AS ex FROM video_transcript_segment WHERE video_id = $1`,
      [videoId],
    );
    expect(row.fr).toBe(`'kubernet':1 'pod':4 'redemarr':2`);
    expect(row.ex).toContain(`'kubernetes':1`);
  });

  it('migration down then up leaves a working schema', async () => {
    const runner = db.createQueryRunner();
    try {
      await new AddContentSearch1794470400000().down(runner);
      await new AddContentSearch1794470400000().up(runner);
    } finally {
      await runner.release();
    }
    const [t] = await db.query(
      `SELECT to_regclass('video_transcript')::text AS t`,
    );
    expect(t.t).toBe('video_transcript');
  });
});
