import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { parseSearchQuery } from '../domain/query-parser';
import {
  Page,
  SearchFilters,
  SearchHit,
  SearchResult,
  TextPart,
  Viewer,
} from '../domain/search.types';
import {
  FixtureIds,
  loadSearchFixture,
  openSearchTestDatabase,
} from '../testing/search-fixture';
import { PostgresSearchGateway } from './postgres-search.gateway';

const integration = process.env.SEARCH_TEST_DATABASE_URL
  ? describe
  : describe.skip;

const NO_FILTERS: SearchFilters = {
  tags: [],
  users: [],
  favoris: false,
  archived: false,
};
const FIRST_PAGE: Page = { limit: 20, offset: 0, sort: 'relevance' };

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);
const hits = (parts: TextPart[]) =>
  parts.filter((part) => part.hit).map((part) => part.text);
const joined = (parts: TextPart[]) => parts.map((part) => part.text).join('');

// Expectations come from the design's annexe A (fixture creation dates, from
// the most recent: pgsearch, k8s, rgpd, ffmpeg, sport, logique).
integration('PostgresSearchGateway.search (fixture of annexe A)', () => {
  let db: DataSource;
  let ids: FixtureIds;
  let gateway: PostgresSearchGateway;
  let user: Viewer;
  let admin: Viewer;
  /** Video id -> fixture key, or the name given to a video added by a test. */
  const names = new Map<string, string>();

  beforeAll(async () => {
    db = await openSearchTestDatabase(process.env.SEARCH_TEST_DATABASE_URL!);
    ids = await loadSearchFixture(db);
    for (const [key, id] of Object.entries(ids)) names.set(id, key);
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

  function search(
    input: string,
    filters: Partial<SearchFilters> = {},
    page: Partial<Page> = {},
    viewer: Viewer = user,
  ): Promise<SearchResult> {
    return gateway.search(
      parseSearchQuery(input),
      { ...NO_FILTERS, ...filters },
      { ...FIRST_PAGE, ...page },
      viewer,
    );
  }

  const found = (result: SearchResult) =>
    result.videos.map((hit) => names.get(hit.video.id));
  const hitOf = (result: SearchResult, key: string): SearchHit =>
    result.videos.find((hit) => names.get(hit.video.id) === key)!;
  const starts = (hit: SearchHit) => hit.passages.map((p) => p.start);

  /**
   * Adds a video (by `demo` unless `creatorId` says otherwise); with `cues`,
   * also its indexed transcript (one cue every 10 s). Tests delete it with
   * `removeVideo` when they are done.
   */
  async function insertVideo(
    name: string,
    video: {
      title: string;
      createdDaysAgo: number;
      cues?: string[];
      transcodingStatus?: string;
      creatorId?: string | null;
      duration?: number | null;
    },
  ): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO video_entity (id, media_id, miniature_id, subtitle_id, transcription_status,
         title, description, external_speakers, views, duration, transcoding_status, archived,
         "creatorId", "createdAt", "updatedAt")
       VALUES ($1, 'master.m3u8', 'image.jpg', $2, $3, $4, '', '', 0, $8, $5, false,
         $6, now() - $7::int * interval '1 day', now())`,
      [
        id,
        video.cues ? `subtitle-auto-${id}.vtt` : null,
        video.cues ? 'ready' : 'waiting_audio',
        video.title,
        video.transcodingStatus ?? 'ready',
        video.creatorId === undefined ? user.userId : video.creatorId,
        video.createdDaysAgo,
        video.duration === undefined ? 600 : video.duration,
      ],
    );
    if (video.cues) {
      await db.query(
        `INSERT INTO video_transcript_segment (video_id, position, start_s, end_s, text)
         SELECT $1, i - 1, (i - 1) * 10, i * 10, text
         FROM unnest($2::text[]) WITH ORDINALITY AS c(text, i)`,
        [id, video.cues],
      );
      await db.query(
        `INSERT INTO video_transcript (video_id, subtitle_key, source, language, segment_count, tsv_fr, tsv_exact)
         SELECT v.id, v.subtitle_id, 'auto', 'fr', count(*)::int,
                setweight(to_tsvector('ochocast_fr', string_agg(s.text, ' ' ORDER BY s.position)), 'D'),
                to_tsvector('ochocast_exact', string_agg(s.text, ' ' ORDER BY s.position))
         FROM video_entity v
         JOIN video_transcript_segment s ON s.video_id = v.id
         WHERE v.id = $1
         GROUP BY v.id, v.subtitle_id`,
        [id],
      );
    }
    names.set(id, name);
    return id;
  }

  const removeVideo = (id: string) =>
    db.query(`DELETE FROM video_entity WHERE id = $1`, [id]);

  async function withFavourites(
    keys: (keyof FixtureIds)[],
    run: () => Promise<void>,
  ): Promise<void> {
    await db.query(
      `INSERT INTO user_favorite_videos (user_id, video_id) SELECT $1, unnest($2::uuid[])`,
      [user.userId, keys.map((key) => ids[key])],
    );
    try {
      await run();
    } finally {
      await db.query(`DELETE FROM user_favorite_videos`);
    }
  }

  it('k8s is found by kubernetes in title, tags and transcript', async () => {
    const result = await search('kubernetes');

    expect(result.query).toBe('kubernetes');
    expect(result.total).toBe(1);
    expect(result.passageTotal).toBe(3);
    expect(found(result)).toEqual(['k8s']);
    const [hit] = result.videos;
    expect(hit.video).toEqual({
      id: ids.k8s,
      title: 'Déployer une plateforme vidéo sur Kubernetes',
      miniature_id: 'image.jpg',
      duration: 2712,
      views: 0,
      createdAt: expect.any(Date),
      creator: {
        id: user.userId,
        username: 'demo',
        firstName: 'Demo',
        lastName: 'Account',
      },
      speakers: ['Camille Martin'],
      tags: ['devops', 'kubernetes', 'scaleway'],
    });
    expect(hit.titleParts).toEqual([
      { text: 'Déployer une plateforme vidéo sur ', hit: false },
      { text: 'Kubernetes', hit: true },
    ]);
    expect(hit.matchedIn).toEqual(['title', 'tags', 'transcript']);
    expect(typeof hit.score).toBe('number');
    expect(hit.passageCount).toBe(3);
    expect(hit.passages.map((p) => [p.start, p.end, p.best])).toEqual([
      [95, 260, true],
      [1012, 1290, true],
      [2560, 2712, true],
    ]);
    expect(hit.passages[0].parts).toEqual([
      { text: 'On a choisi ', hit: false },
      { text: 'Kubernetes', hit: true },
      {
        text: ' parce qu’on voulait redéployer sans couper le service.',
        hit: false,
      },
    ]);
  });

  it('finds the exact phrase données personnelles', async () => {
    const result = await search('"données personnelles"');

    expect(found(result)).toEqual(['k8s', 'rgpd', 'sport']);
    expect(result.passageTotal).toBe(3);
    expect(result.videos.map(starts)).toEqual([[1290], [140], [1100]]);
    for (const hit of result.videos) {
      expect(hit.passageCount).toBe(1);
      expect(hits(hit.passages[0].parts)).toEqual(['données', 'personnelles']);
    }
  });

  it('stems conférences', async () => {
    const result = await search('conférences');

    expect(result.total).toBe(4);
    expect(found(result)[0]).toBe('pgsearch');
    expect([...found(result)].sort()).toEqual([
      'k8s',
      'pgsearch',
      'rgpd',
      'sport',
    ]);
    expect(result.passageTotal).toBe(5);
    const pgsearch = result.videos[0];
    expect(pgsearch.passageCount).toBe(2);
    expect(starts(pgsearch)).toEqual([10, 620]);
    expect(pgsearch.passages.map((p) => hits(p.parts))).toEqual([
      ['conférence'],
      ['conférences', 'conférence'],
    ]);
  });

  it('ignores accents with ecole', async () => {
    const result = await search('ecole');

    expect(found(result)).toEqual(['logique', 'pgsearch', 'rgpd']);
    expect(hitOf(result, 'logique').matchedIn).toEqual(['tags', 'transcript']);
    expect(result.videos.map(starts)).toEqual([[820], [860], [1390]]);
    expect(result.videos.map((hit) => hits(hit.passages[0].parts))).toEqual([
      ['école'],
      ['école', 'ecole'],
      ['école'],
    ]);
  });

  it('excludes with -audio', async () => {
    expect(found(await search('ffmpeg'))).toEqual(['ffmpeg', 'k8s']);

    const result = await search('ffmpeg -audio');

    expect(found(result)).toEqual(['k8s']);
    expect(result.total).toBe(1);
    expect(result.passageTotal).toBe(1);
    const [k8s] = result.videos;
    expect(k8s.matchedIn).toEqual(['description', 'transcript']);
    expect(starts(k8s)).toEqual([498]);
    expect(hits(k8s.passages[0].parts)).toEqual(['FFmpeg']);
  });

  it('ranks title matches before description matches for ffmpeg or rgpd', async () => {
    const result = await search('ffmpeg or rgpd');

    expect(result.total).toBe(3);
    expect(found(result).slice(0, 2).sort()).toEqual(['ffmpeg', 'rgpd']);
    expect(found(result)[2]).toBe('k8s');
    expect(hitOf(result, 'ffmpeg').matchedIn).toContain('title');
    expect(hitOf(result, 'rgpd').matchedIn).toContain('title');
    expect(hitOf(result, 'k8s').matchedIn).toEqual([
      'description',
      'transcript',
    ]);
  });

  it('matches terms across title and transcript', async () => {
    const result = await search('kubernetes sauvegardes');

    expect(found(result)).toEqual(['k8s']);
    const [k8s] = result.videos;
    expect(k8s.passageCount).toBe(4);
    expect(starts(k8s)).toEqual([95, 1012, 1544, 2560]);
    expect(hits(k8s.passages[2].parts)).toEqual(['sauvegardes']);
    expect((await search('kubernetes football')).total).toBe(0);
  });

  it('highlights the phrase index de recherche', async () => {
    const result = await search('"index de recherche"');

    expect(found(result)).toEqual(['pgsearch']);
    const [pgsearch] = result.videos;
    expect(starts(pgsearch)).toEqual([390]);
    expect(pgsearch.passages[0].parts).toContainEqual({
      text: 'index',
      hit: true,
    });
    // The title does not contain the phrase: it is not highlighted.
    expect(pgsearch.titleParts).toEqual([
      { text: 'Rechercher dans ses vidéos avec PostgreSQL', hit: false },
    ]);
  });

  it('kubrnetes finds nothing', async () => {
    expect(await search('kubrnetes')).toEqual({
      query: 'kubrnetes',
      total: 0,
      passageTotal: 0,
      videos: [],
    });
    // French stemming brings "kubernets" to the root of "kubernetes".
    expect(found(await search('kubernets'))).toEqual(['k8s']);
  });

  it('never matches the creator e-mail', async () => {
    expect((await search('demo@example.test')).total).toBe(0);
    expect((await search('camille.martin@example.test')).total).toBe(0);

    const byUsername = await search('demo');
    expect(byUsername.total).toBe(6);
    expect(JSON.stringify(byUsername)).not.toContain('@example.test');
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

    it('hides archived videos from users', async () => {
      expect((await search('propositionnelle')).total).toBe(0);
      // Defence in depth: archived=true is ignored for a non-admin.
      expect((await search('propositionnelle', { archived: true })).total).toBe(
        0,
      );
      expect((await search('', {}, {}, admin)).total).toBe(5);
    });

    it('shows them to admins with archived=true', async () => {
      const result = await search(
        'propositionnelle',
        { archived: true },
        {},
        admin,
      );
      expect(found(result)).toEqual(['logique']);
      expect(found(await search('', { archived: true }, {}, admin))).toEqual([
        'logique',
      ]);
    });
  });

  it('reads titles live', async () => {
    expect((await search('handball')).total).toBe(0);
    const [{ title }] = await db.query(
      `SELECT title FROM video_entity WHERE id = $1`,
      [ids.sport],
    );
    await db.query(`UPDATE video_entity SET title = $2 WHERE id = $1`, [
      ids.sport,
      'Analyse vidéo du handball',
    ]);
    try {
      const result = await search('handball');
      expect(found(result)).toEqual(['sport']);
      expect(result.videos[0].matchedIn).toEqual(['title']);
    } finally {
      await db.query(`UPDATE video_entity SET title = $2 WHERE id = $1`, [
        ids.sport,
        title,
      ]);
    }
  });

  it('finds a video still transcoding by its title', async () => {
    const id = await insertVideo('tournage', {
      title: 'Tournage en cours de traitement',
      createdDaysAgo: 1,
      transcodingStatus: 'pending',
    });
    try {
      const result = await search('tournage');
      expect(found(result)).toEqual(['tournage']);
      expect(result.videos[0]).toMatchObject({
        matchedIn: ['title'],
        passageCount: 0,
        passages: [],
      });
    } finally {
      await removeVideo(id);
    }
  });

  it('title beats 15 transcript hits', async () => {
    const inTitle = await insertVideo('gyroscope-title', {
      title: 'Le gyroscope expliqué',
      createdDaysAgo: 40,
    });
    const inTranscript = await insertVideo('gyroscope-transcript', {
      title: 'Physique amusante',
      createdDaysAgo: 1,
      cues: Array<string>(15).fill('Le gyroscope tourne encore.'),
    });
    try {
      const result = await search('gyroscope');
      expect(found(result)).toEqual([
        'gyroscope-title',
        'gyroscope-transcript',
      ]);
      const [title, transcript] = result.videos;
      expect(transcript.passageCount).toBe(15);
      // The order is strict by field, whatever the score says.
      expect(transcript.score).toBeGreaterThan(title.score);
    } finally {
      await removeVideo(inTitle);
      await removeVideo(inTranscript);
    }
  });

  it('lists favourites without a query', async () => {
    await withFavourites(['logique', 'pgsearch', 'rgpd'], async () => {
      const result = await search('', { favoris: true });

      expect(result).toMatchObject({ query: '', total: 3, passageTotal: 0 });
      expect(found(result)).toEqual(['pgsearch', 'rgpd', 'logique']);
      expect(result.videos[0]).toEqual({
        video: expect.objectContaining({ id: ids.pgsearch }),
        titleParts: [
          { text: 'Rechercher dans ses vidéos avec PostgreSQL', hit: false },
        ],
        matchedIn: [],
        score: 0,
        passageCount: 0,
        passages: [],
      });
    });
  });

  it('widens the users filter', async () => {
    const byUsers = async (users: string[], input = '') =>
      found(await search(input, { users }));

    expect(await byUsers(['camille'])).toEqual(['pgsearch', 'k8s']);
    expect(await byUsers(['MARTIN'])).toEqual(['pgsearch', 'k8s']);
    expect(await byUsers(['Camille Martin'])).toEqual(['pgsearch', 'k8s']);
    expect(await byUsers(['lefevre'])).toEqual(['sport']);
    expect(await byUsers(['ines.haddad'])).toEqual(['rgpd']);
    expect(await byUsers(['Sarah', 'Lucas'])).toEqual(['ffmpeg', 'logique']);
    expect(await byUsers(['demo'])).toEqual([
      'pgsearch',
      'k8s',
      'rgpd',
      'ffmpeg',
      'sport',
      'logique',
    ]);
    expect(await byUsers(['cam'])).toEqual([]);
    expect(await byUsers(['camille.martin@example.test'])).toEqual([]);
    expect(await byUsers(['camille'], 'conférences')).toEqual([
      'pgsearch',
      'k8s',
    ]);
  });

  it('marks the 3 best passages and returns them in time order', async () => {
    const id = await insertVideo('drones', {
      title: 'Essais en vol',
      createdDaysAgo: 1,
      cues: [
        'Un drone.',
        'Drone, drone et drone.',
        'Pas de mot ici.',
        'Le drone et encore le drone.',
        'Un drone.',
        'Drone drone drone drone.',
        'Un drone.',
      ],
    });
    try {
      const [hit] = (await search('drone')).videos;
      expect(hit.passageCount).toBe(6);
      expect(hit.passages.map((p) => [p.start, p.best])).toEqual([
        [0, false],
        [10, true],
        [30, true],
        [40, false],
        [50, true],
        [60, false],
      ]);
    } finally {
      await removeVideo(id);
    }
  });

  it('keeps the 20 best passages of a video', async () => {
    const cues = Array<string>(25).fill('Un hélicoptère passe.');
    cues[22] = 'Un hélicoptère, puis un autre hélicoptère.';
    const id = await insertVideo('helicopteres', {
      title: 'Longue session',
      createdDaysAgo: 1,
      cues,
    });
    try {
      const result = await search('hélicoptère');
      const [hit] = result.videos;
      expect(result.passageTotal).toBe(25);
      expect(hit.passageCount).toBe(25);
      // Best first (220 s), then ties by start time; returned in time order.
      expect(starts(hit)).toEqual([
        ...Array.from({ length: 19 }, (_, i) => i * 10),
        220,
      ]);
      expect(hit.passages.filter((p) => p.best).map((p) => p.start)).toEqual([
        0, 10, 220,
      ]);
    } finally {
      await removeVideo(id);
    }
  });

  it('does not fail on raw operator input', async () => {
    const inputs = [
      'a & b | !c :*',
      `'; DROP TABLE x; --`,
      '"open',
      '🚀 kubernetes',
      'l’école',
      "l'école",
      '--',
      '-',
      '""',
    ];
    for (const input of inputs) {
      await expect(search(input)).resolves.toMatchObject({ query: input });
    }
    // Same videos; the order may differ, as the exact-form bonus also looks
    // for the elided "l".
    const sorted = async (input: string) => found(await search(input)).sort();
    const ecole = await sorted('ecole');
    expect(ecole).toEqual(['logique', 'pgsearch', 'rgpd']);
    expect(await sorted('l’école')).toEqual(ecole);
    expect(await sorted("l'école")).toEqual(ecole);
    expect(found(await search('🚀 kubernetes'))).toEqual(['k8s']);
  });

  it('returns nothing for stop words with an exclusion', async () => {
    expect((await search('le -audio')).total).toBe(0);
    expect((await search('le')).total).toBe(0);
    expect((await search('-audio')).total).toBe(0);
  });

  it('titleParts and passage parts round-trip the original text', async () => {
    const [k8s] = (await search('kubernetes')).videos;
    expect(joined(k8s.titleParts)).toBe(
      'Déployer une plateforme vidéo sur Kubernetes',
    );
    expect(k8s.passages.map((p) => joined(p.parts))).toEqual([
      'On a choisi Kubernetes parce qu’on voulait redéployer sans couper le service.',
      'Kubernetes redémarre le pod, mais la vidéo en cours de traitement est perdue.',
      'Merci, je prends vos questions sur Kubernetes et sur le reste.',
    ]);

    const [{ title }] = await db.query(
      `SELECT title FROM video_entity WHERE id = $1`,
      [ids.k8s],
    );
    await db.query(`UPDATE video_entity SET title = $2 WHERE id = $1`, [
      ids.k8s,
      'Déployer <b>test</b> sur Kubernetes',
    ]);
    try {
      const [hit] = (await search('test')).videos;
      expect(hit.titleParts).toEqual([
        { text: 'Déployer <b>', hit: false },
        { text: 'test', hit: true },
        { text: '</b> sur Kubernetes', hit: false },
      ]);
    } finally {
      await db.query(`UPDATE video_entity SET title = $2 WHERE id = $1`, [
        ids.k8s,
        title,
      ]);
    }
  });

  it('ignores a stale transcript', async () => {
    const [{ subtitle_id }] = await db.query(
      `SELECT subtitle_id FROM video_entity WHERE id = $1`,
      [ids.k8s],
    );
    await db.query(
      `UPDATE video_entity SET subtitle_id = 'subtitle-new.vtt' WHERE id = $1`,
      [ids.k8s],
    );
    try {
      const result = await search('sauvegardes');
      expect(found(result)).toEqual(['k8s']);
      expect(result.passageTotal).toBe(0);
      expect(result.videos[0]).toMatchObject({
        matchedIn: ['description'],
        passageCount: 0,
        passages: [],
      });
      // "microservices" is only said in the k8s transcript.
      expect((await search('microservices')).total).toBe(0);
    } finally {
      await db.query(`UPDATE video_entity SET subtitle_id = $2 WHERE id = $1`, [
        ids.k8s,
        subtitle_id,
      ]);
    }
    expect((await search('microservices')).total).toBe(1);
  });

  it('filters by tags, dates and favourites', async () => {
    const list = async (filters: Partial<SearchFilters>, input = '') =>
      found(await search(input, filters));

    expect(await list({ tags: ['DevOps'] })).toEqual(['k8s']);
    expect(await list({ tags: ['ecole'] })).toEqual(['logique']);
    expect(await list({ tags: ['video', 'RGPD'] })).toEqual([
      'rgpd',
      'ffmpeg',
      'sport',
    ]);
    expect(await list({ tags: ['sport'] }, 'données')).toEqual(['sport']);

    expect(await list({ dateFrom: daysAgo(13), dateTo: daysAgo(3) })).toEqual([
      'k8s',
      'rgpd',
    ]);
    expect(await list({ dateTo: daysAgo(25) })).toEqual(['sport', 'logique']);
    expect(await list({ dateFrom: daysAgo(10) }, 'conférences')).toEqual([
      'pgsearch',
      'k8s',
    ]);

    await withFavourites(['rgpd', 'logique'], async () => {
      expect(await list({ favoris: true })).toEqual(['rgpd', 'logique']);
      expect(await list({ favoris: true }, 'conférences')).toEqual(['rgpd']);
      const [{ id: other }] = await db.query(
        `SELECT id FROM user_entity WHERE username = 'camille.martin'`,
      );
      const result = await search(
        '',
        { favoris: true },
        {},
        { userId: other, isAdmin: false },
      );
      expect(result.total).toBe(0);
    });
  });

  it('paginates with total and offset', async () => {
    const all = found(await search('conférences'));

    const first = await search('conférences', {}, { limit: 2, offset: 0 });
    expect(found(first)).toEqual(all.slice(0, 2));
    expect(first).toMatchObject({ total: 4, passageTotal: 5 });
    const second = await search('conférences', {}, { limit: 2, offset: 2 });
    expect(found(second)).toEqual(all.slice(2, 4));
    const beyond = await search('conférences', {}, { limit: 2, offset: 10 });
    expect(beyond).toMatchObject({ total: 4, passageTotal: 5, videos: [] });

    const listed = await search('', {}, { limit: 2, offset: 4 });
    expect(found(listed)).toEqual(['sport', 'logique']);
    expect(listed.total).toBe(6);
  });

  it('sorts by recent', async () => {
    const recent = { sort: 'recent' } as const;
    expect(found(await search('ffmpeg or rgpd', {}, recent))).toEqual([
      'k8s',
      'rgpd',
      'ffmpeg',
    ]);
    expect(found(await search('ecole', {}, recent))).toEqual([
      'pgsearch',
      'rgpd',
      'logique',
    ]);
  });

  it('builds cards with external speakers, no creator and no duration', async () => {
    await db.query(
      `UPDATE video_entity SET external_speakers = $2 WHERE id = $1`,
      [ids.k8s, 'Alice Dupont, , Bob '],
    );
    const id = await insertVideo('anonyme', {
      title: 'Tournage anonyme',
      createdDaysAgo: 1,
      creatorId: null,
      duration: null,
    });
    try {
      const [k8s] = (await search('alice')).videos;
      expect(k8s.video.speakers).toEqual([
        'Camille Martin',
        'Alice Dupont',
        'Bob',
      ]);
      expect(k8s.matchedIn).toEqual(['people']);
      const [anonymous] = (await search('anonyme')).videos;
      expect(anonymous.video).toMatchObject({ creator: null, duration: 0 });
    } finally {
      await db.query(
        `UPDATE video_entity SET external_speakers = '' WHERE id = $1`,
        [ids.k8s],
      );
      await removeVideo(id);
    }
  });

  it('matchedIn contains people', async () => {
    const result = await search('camille');
    expect(found(result)).toEqual(['pgsearch', 'k8s']);
    expect(result.videos.map((hit) => hit.matchedIn)).toEqual([
      ['people'],
      ['people'],
    ]);
  });
});
