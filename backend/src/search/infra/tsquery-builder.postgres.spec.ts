import { DataSource } from 'typeorm';
import { parseSearchQuery } from '../domain/query-parser';
import { openSearchTestDatabase } from '../testing/search-fixture';
import { buildTsQueries, EXACT_CONFIG, SEARCH_CONFIG } from './tsquery-builder';

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
    const q = await render(`x'; DROP TABLE y; --`);
    expect(q.all).toBe(`'x' & 'drop' & 'tabl'`);
  });

  // Fragments are embedded right after `@@`, with no parentheses added by the
  // caller: `&&` and `||` share the precedence of `@@`.
  describe('composed with @@', () => {
    const matches = async (
      key: 'all' | 'any' | 'positive' | 'exact',
      input: string,
      text: string,
    ): Promise<boolean> => {
      const params: unknown[] = [text];
      const q = buildTsQueries(parseSearchQuery(input), params)!;
      // `any` and `positive` do not use the exclusion parameters, and
      // PostgreSQL requires every bound parameter to be referenced.
      const unused = params
        .slice(1)
        .map((_, i) => ` AND $${i + 2}::text IS NOT NULL`)
        .join('');
      const config = key === 'exact' ? EXACT_CONFIG : SEARCH_CONFIG.fr;
      const [row] = await db.query(
        `SELECT (to_tsvector('${config}', $1) @@ ${q[key]})${unused} AS hit`,
        params,
      );
      return row.hit;
    };

    it('all: requires every group and rejects exclusions', async () => {
      const query = 'vidéo montage -audio -"données personnelles"';
      expect(await matches('all', query, 'Un montage de la vidéo')).toBe(true);
      expect(await matches('all', query, 'Un montage seul')).toBe(false);
      expect(await matches('all', query, 'Le montage vidéo et audio')).toBe(
        false,
      );
      expect(
        await matches('all', query, 'Montage vidéo, données personnelles'),
      ).toBe(false);
    });

    it('all: accepts any alternative of a group', async () => {
      const query = 'vidéo or film montage -audio';
      expect(await matches('all', query, 'Le film du montage')).toBe(true);
      expect(await matches('all', query, 'Le film sans rien')).toBe(false);
    });

    it('any: matches when one group is present', async () => {
      expect(await matches('any', 'vidéo montage', 'Un montage')).toBe(true);
      expect(await matches('any', 'vidéo montage', 'Un son')).toBe(false);
    });

    it('positive: ignores exclusions', async () => {
      const query = 'vidéo montage -audio';
      expect(await matches('positive', query, 'Montage vidéo audio')).toBe(
        true,
      );
      expect(await matches('positive', query, 'Montage audio')).toBe(false);
    });

    it('exact: matches the unstemmed form only', async () => {
      const query = 'montages -audio';
      expect(await matches('exact', query, 'Des montages')).toBe(true);
      expect(await matches('exact', query, 'Un montage')).toBe(false);
    });
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
