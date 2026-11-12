import { DataSource } from 'typeorm';
import {
  FixtureIds,
  loadSearchFixture,
  openSearchTestDatabase,
} from './search-fixture';

const integration = process.env.SEARCH_TEST_DATABASE_URL
  ? describe
  : describe.skip;

integration('search fixture (dedicated test database)', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await openSearchTestDatabase(process.env.SEARCH_TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db?.destroy();
  });

  it('loads the six fixture videos', async () => {
    const ids: FixtureIds = await loadSearchFixture(db);
    const [{ count }] = await db.query(
      `SELECT count(*)::int AS count FROM video_entity`,
    );
    expect(count).toBe(6);
    const [{ segments }] = await db.query(
      `SELECT count(*)::int AS segments FROM video_transcript_segment WHERE video_id = $1`,
      [ids.k8s],
    );
    expect(segments).toBe(11);
    const [{ matches }] = await db.query(
      `SELECT tsv_fr @@ plainto_tsquery('ochocast_fr', 'kubernetes') AS matches
       FROM video_transcript WHERE video_id = $1`,
      [ids.k8s],
    );
    expect(matches).toBe(true);
  });
});
