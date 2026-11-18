import { DataSource } from 'typeorm';
import { parseSearchQuery } from '../domain/query-parser';
import { openSearchTestDatabase } from '../testing/search-fixture';
import { buildTsQueries } from './tsquery-builder';

const integration = process.env.SEARCH_TEST_DATABASE_URL
  ? describe
  : describe.skip;

integration('buildTsQueries (PostgreSQL)', () => {
  let db: DataSource;
  beforeAll(async () => {
    db = await openSearchTestDatabase(process.env.SEARCH_TEST_DATABASE_URL!);
  });
  afterAll(async () => {
    await db?.destroy();
  });

  // Every fragment is evaluated in a single statement, so all parameters are
  // referenced and PostgreSQL checks each fragment.
  async function render(input: string) {
    const params: unknown[] = [];
    const q = buildTsQueries(parseSearchQuery(input), params)!;
    const [row] = await db.query(
      `SELECT (${q.all})::text AS "all", (${q.any})::text AS "any",
              (${q.positive})::text AS "positive", (${q.exact})::text AS "exact"`,
      params,
    );
    return row as Record<'all' | 'any' | 'positive' | 'exact', string>;
  }

  it('negates excluded words', async () => {
    const q = await render('ffmpeg -audio');
    expect(q.all).toBe(`'ffmpeg' & !'audio'`);
    expect(q.positive).toBe(`'ffmpeg'`);
    expect(q.any).toBe(`'ffmpeg'`);
  });

  it('builds a phrase query for quoted text', async () => {
    const q = await render('"données personnelles"');
    expect(q.all).toBe(`'donne' <-> 'personnel'`);
  });

  it('negates excluded phrases', async () => {
    const q = await render('ffmpeg -"données personnelles"');
    expect(q.all).toBe(`'ffmpeg' & !( 'donne' <-> 'personnel' )`);
  });

  it('joins alternatives with | and groups with &', async () => {
    const q = await render('ffmpeg or rgpd');
    expect(q.any).toBe(`'ffmpeg' | 'rgpd'`);
    expect((await render('ffmpeg rgpd')).any).toBe(`'ffmpeg' | 'rgpd'`);
    expect((await render('ffmpeg rgpd')).all).toBe(`'ffmpeg' & 'rgpd'`);
  });

  it('uses the exact configuration without stemming', async () => {
    const q = await render('données');
    expect(q.exact).toBe(`'donnees'`);
    expect(q.all).toBe(`'donne'`);
  });

  it('passes an injection attempt as data', async () => {
    const params: unknown[] = [];
    const queries = buildTsQueries(
      parseSearchQuery(`x'; DROP TABLE y; --`),
      params,
    )!;
    await expect(
      db.query(`SELECT (${queries.all})::text AS q`, params),
    ).resolves.toHaveLength(1);
  });

  it('works after existing parameters', async () => {
    const params: unknown[] = ['prefix'];
    const queries = buildTsQueries(parseSearchQuery('ffmpeg'), params)!;
    const [row] = await db.query(
      `SELECT $1::text AS p, (${queries.all})::text AS q`,
      params,
    );
    expect(row).toEqual({ p: 'prefix', q: `'ffmpeg'` });
  });
});
