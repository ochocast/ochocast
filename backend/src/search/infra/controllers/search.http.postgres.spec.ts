import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { GetTranscriptUsecase } from '../../domain/usecases/get-transcript.usecase';
import { SearchVideosUsecase } from '../../domain/usecases/search-videos.usecase';
import {
  FixtureIds,
  loadSearchFixture,
  openSearchTestDatabase,
} from '../../testing/search-fixture';
import { PostgresSearchGateway } from '../postgres-search.gateway';
import { SearchController } from './search.controller';

const integration = process.env.SEARCH_TEST_DATABASE_URL
  ? describe
  : describe.skip;

const DEMO_EMAIL = 'demo@example.test';
const ADMIN_EMAIL = 'admin@example.test';

const sortedKeys = (value: object): string[] => Object.keys(value).sort();

integration('GET /api/search (HTTP contract, dedicated test database)', () => {
  let db: DataSource;
  let app: INestApplication;
  let currentEmail: string | undefined;
  let ids: FixtureIds;

  const get = (query: string) => {
    const call = request(app.getHttpServer()).get(`/api/search${query}`);
    return call;
  };

  beforeAll(async () => {
    db = await openSearchTestDatabase(process.env.SEARCH_TEST_DATABASE_URL!);
    ids = await loadSearchFixture(db);
    const users = new Map<string, { id: string; role: string }>();
    const [demo] = await db.query(
      `SELECT id FROM user_entity WHERE email = $1`,
      [DEMO_EMAIL],
    );
    users.set(DEMO_EMAIL, { id: demo.id, role: 'user' });
    const adminId = randomUUID();
    await db.query(
      `INSERT INTO user_entity (id, username, "firstName", "lastName", email, role, "createdAt")
       VALUES ($1, 'root', 'Root', 'Admin', $2, 'admin', now())`,
      [adminId, ADMIN_EMAIL],
    );
    users.set(ADMIN_EMAIL, { id: adminId, role: 'admin' });

    const module = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [
        SearchVideosUsecase,
        GetTranscriptUsecase,
        { provide: 'SearchGateway', useClass: PostgresSearchGateway },
        { provide: DataSource, useValue: db },
        {
          provide: 'UserGateway',
          useValue: {
            getUserByEmail: async (email: string) => users.get(email) ?? null,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(
      (req: { user?: { email: string } }, _res: unknown, next: () => void) => {
        if (currentEmail) req.user = { email: currentEmail };
        next();
      },
    );
    await app.init();
  });

  beforeEach(() => {
    currentEmail = DEMO_EMAIL;
  });

  afterAll(async () => {
    await app?.close();
    await db?.destroy();
  });

  it('answers the shape of the front contract (searchApi.ts)', async () => {
    const response = await get('?q=kubernetes').expect(200);
    const body = response.body;

    expect(sortedKeys(body)).toEqual(
      ['passageTotal', 'query', 'total', 'videos'].sort(),
    );
    expect(body.query).toBe('kubernetes');
    expect(body.total).toBe(1);
    expect(typeof body.passageTotal).toBe('number');
    expect(body.passageTotal).toBeGreaterThan(0);
    expect(body.videos).toHaveLength(1);

    const hit = body.videos[0];
    expect(sortedKeys(hit)).toEqual(
      [
        'matchedIn',
        'passageCount',
        'passages',
        'score',
        'titleParts',
        'video',
      ].sort(),
    );
    expect(typeof hit.score).toBe('number');
    expect(typeof hit.passageCount).toBe('number');
    expect(hit.passageCount).toBeGreaterThan(0);
    expect(Array.isArray(hit.matchedIn)).toBe(true);
    for (const field of hit.matchedIn) {
      expect([
        'title',
        'tags',
        'people',
        'description',
        'transcript',
      ]).toContain(field);
    }

    expect(sortedKeys(hit.video)).toEqual(
      [
        'createdAt',
        'creator',
        'duration',
        'id',
        'miniature_id',
        'speakers',
        'tags',
        'title',
        'views',
      ].sort(),
    );
    expect(typeof hit.video.id).toBe('string');
    expect(typeof hit.video.title).toBe('string');
    expect(typeof hit.video.miniature_id).toBe('string');
    expect(typeof hit.video.duration).toBe('number');
    expect(typeof hit.video.views).toBe('number');
    expect(typeof hit.video.createdAt).toBe('string');
    expect(new Date(hit.video.createdAt).toISOString()).toBe(
      hit.video.createdAt,
    );
    expect(Array.isArray(hit.video.speakers)).toBe(true);
    hit.video.speakers.forEach((s: unknown) => expect(typeof s).toBe('string'));
    expect(Array.isArray(hit.video.tags)).toBe(true);
    hit.video.tags.forEach((t: unknown) => expect(typeof t).toBe('string'));

    expect(sortedKeys(hit.video.creator)).toEqual(
      ['firstName', 'id', 'lastName', 'username'].sort(),
    );
    for (const key of ['id', 'username', 'firstName', 'lastName']) {
      expect(typeof hit.video.creator[key]).toBe('string');
    }

    expect(hit.titleParts.length).toBeGreaterThan(0);
    for (const part of hit.titleParts) {
      expect(sortedKeys(part)).toEqual(['hit', 'text']);
      expect(typeof part.text).toBe('string');
      expect(typeof part.hit).toBe('boolean');
    }

    expect(hit.passages.length).toBeGreaterThan(0);
    for (const passage of hit.passages) {
      expect(sortedKeys(passage)).toEqual(['best', 'end', 'parts', 'start']);
      expect(typeof passage.start).toBe('number');
      expect(typeof passage.end).toBe('number');
      expect(typeof passage.best).toBe('boolean');
      expect(passage.parts.length).toBeGreaterThan(0);
      for (const part of passage.parts) {
        expect(sortedKeys(part)).toEqual(['hit', 'text']);
        expect(typeof part.text).toBe('string');
        expect(typeof part.hit).toBe('boolean');
      }
    }
    expect(
      hit.passages.some((p: { parts: { hit: boolean }[] }) =>
        p.parts.some((part) => part.hit),
      ),
    ).toBe(true);
  });

  it('never leaks the highlight markers or an e-mail', async () => {
    const response = await get('?q=kubernetes').expect(200);
    const text = JSON.stringify(response.body);
    expect(text).not.toContain('\u0002');
    expect(text).not.toContain('\u0003');
    expect(text).not.toContain('\\u0002');
    expect(text).not.toContain('\\u0003');
    expect(text).not.toContain('@example.test');
  });

  it('lists the videos of the filters alone, newest first, with query ""', async () => {
    const response = await get('?favoris=true').expect(200);
    expect(response.body.query).toBe('');
    expect(response.body.total).toBe(0);
    expect(response.body.videos).toEqual([]);

    const tagged = await get('?tags=kubernetes').expect(200);
    expect(tagged.body.query).toBe('');
    expect(tagged.body.total).toBeGreaterThan(0);
    for (const hit of tagged.body.videos) {
      expect(hit.matchedIn).toEqual([]);
      expect(hit.passages).toEqual([]);
      expect(hit.passageCount).toBe(0);
    }
  });

  it('answers 200 with the whole page when nothing is given', async () => {
    const response = await get('').expect(200);
    expect(response.body.query).toBe('');
    expect(response.body.total).toBe(6);
  });

  it('honours limit and offset', async () => {
    const first = await get('?limit=2&sort=recent').expect(200);
    const second = await get('?limit=2&offset=2&sort=recent').expect(200);
    expect(first.body.total).toBe(6);
    expect(first.body.videos).toHaveLength(2);
    expect(second.body.videos).toHaveLength(2);
    expect(first.body.videos[0].video.id).not.toBe(
      second.body.videos[0].video.id,
    );
  });

  it('answers 400 for a query of 201 characters', async () => {
    await get(`?q=${'a'.repeat(201)}`).expect(400);
    await get(`?q=${'a'.repeat(200)}`).expect(200);
  });

  it('answers 400 for more than 10 groups', async () => {
    const eleven = Array.from({ length: 11 }, (_, i) => `mot${i}`).join('+');
    await get(`?q=${eleven}`).expect(400);
  });

  it.each([
    'limit=0',
    'limit=51',
    'limit=abc',
    'offset=-1',
    'sort=foo',
    'dateFrom=hier',
    'favoris=maybe',
    'archived=1',
    'dateFrom=2024-W10',
    'dateTo=2024-123',
    'offset=1e19',
    'offset=1e30',
  ])('answers 400 for %s', async (query) => {
    await get(`?${query}`).expect(400);
  });

  it('answers 403 for archived=true as a user and 200 as an admin', async () => {
    await get('?archived=true').expect(403);

    currentEmail = ADMIN_EMAIL;
    const response = await get('?archived=true').expect(200);
    expect(response.body.query).toBe('');
    expect(response.body.total).toBe(0);
  });

  it.each(['tags', 'users'])(
    'answers 200 for a NUL byte in %s',
    async (name) => {
      await get(`?${name}=a%00b`).expect(200);
      await get(`?q=kubernetes&${name}=%00`).expect(200);
    },
  );

  it('answers 403 without an authenticated e-mail or for an unknown user', async () => {
    currentEmail = undefined;
    await get('?q=kubernetes').expect(403);
    currentEmail = 'ghost@example.test';
    await get('?q=kubernetes').expect(403);
  });

  it.each([
    ['operators', 'a & b | !c :*'],
    ['an SQL injection', "'; DROP TABLE x; --"],
    ['an unclosed quote', '"open'],
    ['a typographic apostrophe', 'l’école'],
    ['a NUL byte', 'a%00b'],
    ['only exclusions', '-kubernetes'],
  ])('answers 200 for hostile input: %s', async (_label, q) => {
    const encoded = q.includes('%00') ? q : encodeURIComponent(q);
    const response = await get(`?q=${encoded}`).expect(200);
    expect(Array.isArray(response.body.videos)).toBe(true);
  });

  it('answers 200 with no result for a query that matches nothing', async () => {
    const response = await get('?q=zzzzinexistant').expect(200);
    expect(response.body).toEqual({
      query: 'zzzzinexistant',
      total: 0,
      passageTotal: 0,
      videos: [],
    });
  });

  describe('GET /api/videos/:id/transcript', () => {
    const transcript = (id: string, query = '') =>
      request(app.getHttpServer()).get(`/api/videos/${id}/transcript${query}`);

    it('answers the shape of the front contract (searchApi.ts)', async () => {
      const { body } = await transcript(ids.k8s, '?q=kubernetes').expect(200);

      expect(sortedKeys(body)).toEqual(
        ['matches', 'segments', 'source', 'status', 'videoId'].sort(),
      );
      expect(body.videoId).toBe(ids.k8s);
      expect(body.source).toBe('auto');
      expect(body.status).toBe('ready');
      expect(body.matches).toEqual([1, 5, 10]);
      expect(body.segments).toHaveLength(11);
      for (const segment of body.segments) {
        expect(sortedKeys(segment)).toEqual(['end', 'parts', 'start']);
        expect(typeof segment.start).toBe('number');
        expect(typeof segment.end).toBe('number');
        expect(segment.parts.length).toBeGreaterThan(0);
        for (const part of segment.parts) {
          expect(sortedKeys(part)).toEqual(['hit', 'text']);
          expect(typeof part.text).toBe('string');
          expect(typeof part.hit).toBe('boolean');
        }
      }
      for (const index of body.matches) {
        expect(
          body.segments[index].parts.some((part: { hit: boolean }) => part.hit),
        ).toBe(true);
      }
      const text = JSON.stringify(body);
      expect(text).not.toContain('\u0002');
      expect(text).not.toContain('\u0003');
      expect(text).not.toContain('\\u0002');
      expect(text).not.toContain('\\u0003');
      expect(text).not.toContain('@example.test');
    });

    it('answers one plain part per segment without q', async () => {
      const { body } = await transcript(ids.k8s).expect(200);
      expect(body.status).toBe('ready');
      expect(body.matches).toEqual([]);
      for (const segment of body.segments) {
        expect(segment.parts).toHaveLength(1);
        expect(segment.parts[0].hit).toBe(false);
      }
    });

    it('always sends segments and matches, empty when the transcript is not ready', async () => {
      await db.query(
        `UPDATE video_entity SET subtitle_id = NULL, transcription_status = 'waiting_audio' WHERE id = $1`,
        [ids.sport],
      );
      try {
        const { body } = await transcript(ids.sport, '?q=sport').expect(200);
        expect(body).toEqual({
          videoId: ids.sport,
          source: 'auto',
          status: 'none',
          segments: [],
          matches: [],
        });
      } finally {
        await db.query(
          `UPDATE video_entity SET subtitle_id = $2, transcription_status = 'ready' WHERE id = $1`,
          [ids.sport, `subtitle-auto-${ids.sport}.vtt`],
        );
      }
    });

    it('answers 404 for an unknown id and for a malformed one', async () => {
      await transcript(randomUUID()).expect(404);
      await transcript('not-a-uuid', '?q=kubernetes').expect(404);
    });

    it('answers 404 for an archived video to a user, 200 to an admin', async () => {
      await db.query(`UPDATE video_entity SET archived = true WHERE id = $1`, [
        ids.logique,
      ]);
      try {
        await transcript(ids.logique).expect(404);
        currentEmail = ADMIN_EMAIL;
        const { body } = await transcript(ids.logique).expect(200);
        expect(body.status).toBe('ready');
      } finally {
        await db.query(
          `UPDATE video_entity SET archived = false WHERE id = $1`,
          [ids.logique],
        );
      }
    });

    it('answers 400 for a query of 201 characters or 11 groups', async () => {
      await transcript(ids.k8s, `?q=${'a'.repeat(201)}`).expect(400);
      const eleven = Array.from({ length: 11 }, (_, i) => `mot${i}`).join('+');
      await transcript(ids.k8s, `?q=${eleven}`).expect(400);
      await transcript(ids.k8s, `?q=${'a'.repeat(200)}`).expect(200);
    });

    it('answers 400 for a repeated q', async () => {
      await transcript(ids.k8s, '?q=a&q=b').expect(400);
    });

    it('answers 403 without an authenticated e-mail or for an unknown user', async () => {
      currentEmail = undefined;
      await transcript(ids.k8s).expect(403);
      currentEmail = 'ghost@example.test';
      await transcript(ids.k8s).expect(403);
    });

    it.each([
      ['operators', 'a & b | !c :*'],
      ['an SQL injection', "'; DROP TABLE x; --"],
      ['an unclosed quote', '"open'],
    ])('answers 200 for hostile input: %s', async (_label, q) => {
      const { body } = await transcript(
        ids.k8s,
        `?q=${encodeURIComponent(q)}`,
      ).expect(200);
      expect(Array.isArray(body.matches)).toBe(true);
    });
  });
});
