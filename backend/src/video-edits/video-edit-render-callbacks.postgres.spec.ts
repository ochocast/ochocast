import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import * as request from 'supertest';
import { AddTranscodingJobs1789574400000 } from '../migrations/1789574400000-AddTranscodingJobs';
import { CreateVideoEdits1793638092000 } from '../migrations/1793638092000-CreateVideoEdits';
import { AddVideoEditRenderJobs1793891216000 } from '../migrations/1793891216000-AddVideoEditRenderJobs';
import { VideoEditGateway } from './infra/gateways/video-edit.gateway';
import { VideoEditRenderJobsController } from './infra/render-jobs/video-edit-render-jobs.controller';
import { VideoEditRenderJobsService } from './infra/render-jobs/video-edit-render-jobs.service';

const integration = process.env.VIDEO_EDIT_TEST_DATABASE_URL
  ? describe
  : describe.skip;

/**
 * The worker's view: claim and result over HTTP, behind the shared-secret
 * guard, on the real service and database.
 */
integration('render job callbacks (dedicated test database)', () => {
  const secret = 'test-callback-secret-at-least-32-characters';
  let database: DataSource;
  let app: INestApplication;
  let gateway: VideoEditGateway;
  const migrations = [
    new AddTranscodingJobs1789574400000(),
    new CreateVideoEdits1793638092000(),
    new AddVideoEditRenderJobs1793891216000(),
  ];
  const run = async (step: 'up' | 'down') => {
    const runner = database.createQueryRunner();
    try {
      for (const m of step === 'up' ? migrations : [...migrations].reverse())
        await m[step](runner);
    } finally {
      await runner.release();
    }
  };
  const originalSecret = process.env.TRANSCODING_CALLBACK_SECRET;

  beforeAll(async () => {
    process.env.TRANSCODING_CALLBACK_SECRET = secret;
    database = new DataSource({
      type: 'postgres',
      url: process.env.VIDEO_EDIT_TEST_DATABASE_URL,
      entities: [join(__dirname, '../**/*.entity.ts')],
      synchronize: false,
    });
    await database.initialize();
    // Deliberately no IF NOT EXISTS: refuse to touch a database already containing application tables.
    await database.query('CREATE TABLE "video_entity" ("id" uuid PRIMARY KEY)');
    await run('up');
    gateway = new VideoEditGateway(database);
    const moduleRef = await Test.createTestingModule({
      controllers: [VideoEditRenderJobsController],
      providers: [
        {
          provide: VideoEditRenderJobsService,
          useValue: new VideoEditRenderJobsService(database, {
            send: jest.fn(),
          } as any),
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    if (database?.isInitialized) {
      await run('down');
      await database.query('DROP TABLE "video_entity"');
      await database.destroy();
    }
    process.env.TRANSCODING_CALLBACK_SECRET = originalSecret;
  });

  /** A saved montage waiting for its render, as the PUT leaves it. */
  const savedMontage = async () => {
    const videoId = randomUUID();
    await database.query('INSERT INTO "video_entity" ("id") VALUES ($1)', [
      videoId,
    ]);
    const segments = [{ sourceStart: 10, sourceEnd: 70, textLayers: [] }];
    const edit = await gateway.create(videoId, segments);
    const jobId = randomUUID();
    await gateway.replaceContent(videoId, segments, {
      expectedVersion: 1,
      renderStatus: 'pending',
      renderJob: { jobId, sourceKey: `${videoId}/source/original.mp4` },
    });
    return { videoId, editId: edit.id, jobId };
  };

  const post = (path: string, body: object, token = secret) =>
    request(app.getHttpServer())
      .post(`/api/internal/video-edits/render-jobs/${path}`)
      .set('X-Transcoding-Token', token)
      .send(body);

  const result = (
    ids: { jobId: string; editId: string; videoId: string },
    success: boolean,
    extra: object = {},
  ) => ({
    jobId: ids.jobId,
    editId: ids.editId,
    success,
    duration: success ? 60 : 0,
    processedAt: Date.now(),
    ...(success
      ? { mediaId: `${ids.videoId}/edits/${ids.jobId}/master.m3u8` }
      : { error: 'ffmpeg crashed' }),
    ...extra,
  });

  it('claims once, then publishes the rendition', async () => {
    const ids = await savedMontage();

    const claims = await Promise.all([
      post(`${ids.jobId}/claim`, { editId: ids.editId }),
      post(`${ids.jobId}/claim`, { editId: ids.editId }),
    ]);
    expect(claims.map((c) => c.status).sort()).toEqual([200, 409]);
    const claim = claims.find((c) => c.status === 200).body;
    expect(claim).toMatchObject({
      status: 'claimed',
      job: {
        jobId: ids.jobId,
        version: 2,
        outputPrefix: `${ids.videoId}/edits/${ids.jobId}`,
        segments: [{ sourceStart: 10, sourceEnd: 70 }],
      },
    });
    expect((await gateway.findByVideoId(ids.videoId)).renderStatus).toBe(
      'processing',
    );

    await post(`${ids.jobId}/result`, {
      leaseToken: claim.leaseToken,
      result: result(ids, true),
    }).expect(200, { accepted: true });

    expect(await gateway.findByVideoId(ids.videoId)).toMatchObject({
      renderStatus: 'ready',
      renderedMediaId: `${ids.videoId}/edits/${ids.jobId}/master.m3u8`,
      renderedDuration: 60,
    });
    // A late failure of the same lease changes nothing.
    await post(`${ids.jobId}/result`, {
      leaseToken: claim.leaseToken,
      result: result(ids, false),
    }).expect(200);
    expect((await gateway.findByVideoId(ids.videoId)).renderStatus).toBe(
      'ready',
    );
    // A redelivered message is acknowledged without running again.
    await post(`${ids.jobId}/claim`, { editId: ids.editId }).expect(200, {
      status: 'completed',
    });
  });

  it('retries a transient failure, then fails for good', async () => {
    const ids = await savedMontage();
    for (let attempt = 1; attempt <= 3; attempt++) {
      const claim = await post(`${ids.jobId}/claim`, {
        editId: ids.editId,
      }).expect(200);
      await post(`${ids.jobId}/result`, {
        leaseToken: claim.body.leaseToken,
        result: result(ids, false),
      }).expect(200);
      expect((await gateway.findByVideoId(ids.videoId)).renderStatus).toBe(
        attempt < 3 ? 'pending' : 'failed',
      );
    }
  });

  it('rejects a bad token, an unknown job and foreign media', async () => {
    const ids = await savedMontage();
    await post(
      `${ids.jobId}/claim`,
      { editId: ids.editId },
      'x'.repeat(43),
    ).expect(401);
    await post(`${randomUUID()}/claim`, { editId: ids.editId }).expect(410);
    await post(`${ids.jobId}/claim`, { editId: ids.editId, extra: 1 }).expect(
      400,
    );

    const claim = await post(`${ids.jobId}/claim`, {
      editId: ids.editId,
    }).expect(200);
    await post(`${ids.jobId}/result`, {
      leaseToken: claim.body.leaseToken,
      result: result(ids, true, { mediaId: `${ids.videoId}/master.m3u8` }),
    }).expect(400);
    expect((await gateway.findByVideoId(ids.videoId)).renderedMediaId).toBe(
      null,
    );
  });

  it('answers 410 once the video, its montage and its job are deleted', async () => {
    const ids = await savedMontage();
    const claim = await post(`${ids.jobId}/claim`, {
      editId: ids.editId,
    }).expect(200);
    await database.query('DELETE FROM "video_entity" WHERE "id" = $1', [
      ids.videoId,
    ]);
    await post(`${ids.jobId}/result`, {
      leaseToken: claim.body.leaseToken,
      result: result(ids, true),
    }).expect(410);
  });
});
