import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { VideoEditsController } from 'src/video-edits/infra/controllers/video-edits.controller';
import { CreateVideoEditUsecase } from 'src/video-edits/domain/usecases/createVideoEdit.usecase';
import { GetVideoEditUsecase } from 'src/video-edits/domain/usecases/getVideoEdit.usecase';
import { SaveVideoEditUsecase } from 'src/video-edits/domain/usecases/saveVideoEdit.usecase';
import { RevertVideoEditUsecase } from 'src/video-edits/domain/usecases/revertVideoEdit.usecase';
import { VideoEditObject } from 'src/video-edits/domain/videoEdit';

/**
 * The endpoints through Nest (routing, validation pipe, HTTP codes) with the
 * real use cases; only the gateways are in memory. Keycloak is replaced by a
 * middleware reading the user from a header.
 */
describe('VideoEditsController (HTTP)', () => {
  const videoId = 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2';
  const url = `/api/videos/${videoId}/edit`;
  const creator = { id: 'c', email: 'creator@example.com', role: 'user' };
  const stranger = { id: 's', email: 'nobody@example.com', role: 'user' };

  let app: INestApplication;
  let stored: VideoEditObject | null;
  let dispatcher: { enabled: boolean; dispatch: jest.Mock };

  const validBody = () => ({
    version: 1,
    segments: [
      {
        sourceStart: 1270,
        sourceEnd: 2205,
        textLayers: [
          {
            content: 'Partie 2 : démonstration',
            position: 'bottom',
            color: 'white',
            startOffset: 0,
            duration: 600,
          },
        ],
      },
      { sourceStart: 120, sourceEnd: 870 },
    ],
  });

  const editGateway = {
    findByVideoId: jest.fn(async () => stored),
    create: jest.fn(async (id: string, segments: any[]) => {
      if (stored) return null;
      stored = {
        id: 'edit-id',
        videoId: id,
        renderStatus: 'draft',
        renderError: null,
        renderedMediaId: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        segments: segments.map((s, position) => ({
          id: `seg-${position}`,
          position,
          ...s,
        })),
      };
      return stored;
    }),
    replaceContent: jest.fn(async (_id, segments: any[], options: any) => {
      if (!stored) return { status: 'not_found' };
      if (['pending', 'processing'].includes(stored.renderStatus))
        return {
          status: 'render_in_progress',
          renderStatus: stored.renderStatus,
        };
      if (
        options.expectedVersion !== undefined &&
        options.expectedVersion !== stored.version
      )
        return { status: 'version_conflict', currentVersion: stored.version };
      stored = {
        ...stored,
        version: stored.version + 1,
        renderStatus: options.renderStatus,
        segments: segments.map((s, position) => ({
          id: `seg-${position}`,
          position,
          ...s,
        })),
      };
      return { status: 'ok', edit: stored };
    }),
    markRenderFailed: jest.fn(),
  };

  beforeAll(async () => {
    dispatcher = { enabled: true, dispatch: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [VideoEditsController],
      providers: [
        CreateVideoEditUsecase,
        GetVideoEditUsecase,
        SaveVideoEditUsecase,
        RevertVideoEditUsecase,
        { provide: 'VideoEditGateway', useValue: editGateway },
        { provide: 'VideoEditRenderDispatcher', useValue: dispatcher },
        {
          provide: 'VideoGateway',
          useValue: {
            getVideos: async ({ id }) =>
              id === videoId
                ? [
                    {
                      id,
                      creator,
                      duration: 3012,
                      transcoding_status: 'ready',
                    },
                  ]
                : [],
          },
        },
        {
          provide: 'UserGateway',
          useValue: {
            getUserByEmail: async (email: string) =>
              [creator, stranger].find((u) => u.email === email) ?? null,
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req, _res, next) => {
      req.user = { email: req.headers['x-test-user'] };
      next();
    });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    stored = null;
    dispatcher.enabled = true;
    dispatcher.dispatch.mockReset();
  });

  const as = (user: { email: string }) => ({ 'x-test-user': user.email });

  it('creates, reads, saves then reverts a montage', async () => {
    const created = await request(app.getHttpServer())
      .post(url)
      .set(as(creator))
      .expect(201);
    expect(created.body.segments).toEqual([
      expect.objectContaining({ position: 0, sourceStart: 0, sourceEnd: 3012 }),
    ]);

    await request(app.getHttpServer()).get(url).set(as(creator)).expect(200);

    const saved = await request(app.getHttpServer())
      .put(url)
      .set(as(creator))
      .send(validBody())
      .expect(200);
    expect(saved.body).toMatchObject({ version: 2, renderStatus: 'pending' });
    expect(saved.body.segments.map((s) => s.sourceStart)).toEqual([1270, 120]);
    // Omitted text layers default to none.
    expect(saved.body.segments[1].textLayers).toEqual([]);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ videoId, version: 2 }),
    );

    const status = await request(app.getHttpServer())
      .get(`${url}/render-status`)
      .set(as(creator))
      .expect(200);
    expect(status.body).toMatchObject({ renderStatus: 'pending', version: 2 });

    // Nothing changes while a render runs.
    await request(app.getHttpServer())
      .post(`${url}/revert`)
      .set(as(creator))
      .expect(409);
    stored.renderStatus = 'ready';
    const reverted = await request(app.getHttpServer())
      .post(`${url}/revert`)
      .set(as(creator))
      .expect(200);
    expect(reverted.body).toMatchObject({ renderStatus: 'draft', version: 3 });
    expect(reverted.body.segments).toHaveLength(1);
  });

  it('answers 409 to a second creation', async () => {
    await request(app.getHttpServer()).post(url).set(as(creator)).expect(201);
    await request(app.getHttpServer()).post(url).set(as(creator)).expect(409);
  });

  it('answers 403 to a user who may not edit the video', async () => {
    await request(app.getHttpServer()).post(url).set(as(stranger)).expect(403);
  });

  it('answers 404 without a montage', async () => {
    await request(app.getHttpServer()).get(url).set(as(creator)).expect(404);
  });

  it('answers 400 to a malformed video id', async () => {
    await request(app.getHttpServer())
      .get('/api/videos/not-a-uuid/edit')
      .set(as(creator))
      .expect(400);
  });

  it('answers 409 to a stale version', async () => {
    await request(app.getHttpServer()).post(url).set(as(creator)).expect(201);
    const response = await request(app.getHttpServer())
      .put(url)
      .set(as(creator))
      .send({ ...validBody(), version: 7 })
      .expect(409);
    expect(response.body.message).toContain('current version 1');
  });

  it('answers 503 while rendering is unavailable, without saving', async () => {
    await request(app.getHttpServer()).post(url).set(as(creator)).expect(201);
    dispatcher.enabled = false;
    await request(app.getHttpServer())
      .put(url)
      .set(as(creator))
      .send(validBody())
      .expect(503);
    expect(stored.version).toBe(1);
  });

  describe('PUT validation (400)', () => {
    beforeEach(async () => {
      await request(app.getHttpServer()).post(url).set(as(creator));
    });

    const put = (body: object) =>
      request(app.getHttpServer()).put(url).set(as(creator)).send(body);

    it.each([
      ['no version', { segments: validBody().segments }],
      ['no segment', { version: 1, segments: [] }],
      [
        'a string time',
        { version: 1, segments: [{ sourceStart: '0', sourceEnd: 10 }] },
      ],
      [
        'an unknown color',
        {
          version: 1,
          segments: [
            {
              sourceStart: 0,
              sourceEnd: 10,
              textLayers: [
                {
                  content: 'x',
                  position: 'top',
                  color: 'red',
                  startOffset: 0,
                  duration: 1,
                },
              ],
            },
          ],
        },
      ],
    ])('refuses %s', async (_, body) => {
      await put(body).expect(400);
      expect(stored.version).toBe(1);
    });

    it('lists every rule broken by the montage', async () => {
      const response = await put({
        version: 1,
        segments: [
          { sourceStart: 0, sourceEnd: 100 },
          { sourceStart: 50, sourceEnd: 3100 },
        ],
      }).expect(400);
      expect(response.body.message).toEqual([
        'segments[1]: sourceEnd exceeds the video duration (3012s)',
        'segments[1] overlaps segments[0] in the source video',
      ]);
    });

    it('ignores unknown fields such as a client-side id', async () => {
      await put({
        ...validBody(),
        renderStatus: 'ready',
        segments: [{ id: 'local-1', sourceStart: 0, sourceEnd: 10 }],
      }).expect(200);
      expect(editGateway.replaceContent).toHaveBeenLastCalledWith(
        videoId,
        [{ sourceStart: 0, sourceEnd: 10, textLayers: [] }],
        expect.anything(),
      );
    });
  });
});
