import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import request = require('supertest');
import { TranscodingJobsService } from './transcoding-jobs.service';
import {
  TranscodingCallbackGuard,
  TranscodingJobsController,
} from './transcoding-jobs.controller';
import { TranscodingJobEntity } from './transcoding-job.entity';
import {
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../queue/job.types';

const payload: VideoTranscodingJob = {
  jobId: randomUUID(),
  videoId: randomUUID(),
  originalKey: 'source.mp4',
  originalFileName: 'source.mp4',
  media_id: 'master.m3u8',
  miniature_id: 'miniature.jpg',
  title: 'Test',
  timestamp: Date.now(),
};
const result: VideoTranscodingResult = {
  jobId: payload.jobId,
  videoId: payload.videoId,
  success: true,
  duration: 25,
  processedAt: Date.now(),
};

describe('Transcoding job leases', () => {
  let stored: TranscodingJobEntity;
  let service: TranscodingJobsService;
  let update: jest.Mock;
  let findOne: jest.Mock;
  beforeEach(() => {
    stored = Object.assign(new TranscodingJobEntity(), {
      id: payload.jobId,
      videoId: payload.videoId,
      payload,
      status: 'pending',
      attempts: 0,
      leaseExpiresAt: null,
      leaseToken: null,
    });
    findOne = jest.fn(async () => ({ ...stored }));
    const repository = {
      findOne,
      save: jest.fn(async (value) => {
        stored = { ...value };
      }),
    };
    update = jest.fn();
    const manager = { getRepository: () => repository, update };
    service = new TranscodingJobsService({
      transaction: (callback) => callback(manager),
    } as unknown as DataSource);
  });

  it('locks the row and rejects duplicate claims during a running attempt', async () => {
    const claim = await service.claim(payload.jobId, payload.videoId);
    expect(claim.status).toBe('claimed');
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    await expect(
      service.claim(payload.jobId, payload.videoId),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stored.attempts).toBe(1);
  });

  it('rejects stale callbacks after a lease is reclaimed', async () => {
    await service.claim(payload.jobId, payload.videoId);
    const oldToken = stored.leaseToken;
    stored.leaseExpiresAt = new Date(0);
    await service.claim(payload.jobId, payload.videoId);
    await expect(
      service.complete(payload.jobId, oldToken, result),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(stored.attempts).toBe(2);
  });

  it('accepts repeated successful callbacks and never regresses ready to failed', async () => {
    await service.claim(payload.jobId, payload.videoId);
    const token = stored.leaseToken;
    await service.complete(payload.jobId, token, result);
    await service.complete(payload.jobId, token, result);
    await service.complete(payload.jobId, token, {
      ...result,
      success: false,
      error: 'late failure',
    });
    expect(stored.status).toBe('ready');
    expect(stored.result.success).toBe(true);
    expect(await service.claim(payload.jobId, payload.videoId)).toEqual({
      status: 'completed',
    });
  });

  it('records failure and allows a new attempt without deleting the source', async () => {
    await service.claim(payload.jobId, payload.videoId);
    await service.complete(payload.jobId, stored.leaseToken, {
      ...result,
      success: false,
      error: 'temporary error',
    });
    expect(stored.status).toBe('failed');
    await service.complete(payload.jobId, stored.leaseToken, {
      ...result,
      success: false,
      error: 'temporary error',
    });
    expect(stored.leaseExpiresAt).toBeNull();
    expect((await service.claim(payload.jobId, payload.videoId)).status).toBe(
      'claimed',
    );
  });

  it('rejects results for a different job', async () => {
    await service.claim(payload.jobId, payload.videoId);
    await expect(
      service.complete(payload.jobId, stored.leaseToken, {
        ...result,
        jobId: randomUUID(),
      }),
    ).rejects.toThrow('not found');
  });
});

describe('Internal transcoding HTTP API', () => {
  let app: INestApplication;
  const secret = 'test-callback-secret-at-least-32-characters';
  let previous: string | undefined;
  const jobs = {
    claim: jest.fn(async () => ({ status: 'completed' })),
    complete: jest.fn(async () => undefined),
  };
  beforeAll(async () => {
    previous = process.env.TRANSCODING_CALLBACK_SECRET;
    process.env.TRANSCODING_CALLBACK_SECRET = secret;
    const module = await Test.createTestingModule({
      controllers: [TranscodingJobsController],
      providers: [
        TranscodingCallbackGuard,
        { provide: TranscodingJobsService, useValue: jobs },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });
  afterAll(async () => {
    await app.close();
    if (previous === undefined) delete process.env.TRANSCODING_CALLBACK_SECRET;
    else process.env.TRANSCODING_CALLBACK_SECRET = previous;
  });

  it('requires its own secret even though Keycloak is bypassed', async () => {
    await request(app.getHttpServer())
      .post(`/api/internal/transcoding/jobs/${payload.jobId}/claim`)
      .send({ videoId: payload.videoId })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/internal/transcoding/jobs/${payload.jobId}/claim`)
      .set('X-Transcoding-Token', 'wrong')
      .send({ videoId: payload.videoId })
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/internal/transcoding/jobs/${payload.jobId}/claim`)
      .set('X-Transcoding-Token', secret)
      .send({ videoId: payload.videoId })
      .expect(200);
  });

  it('validates nested results and identifiers before changing the database', async () => {
    const endpoint = `/api/internal/transcoding/jobs/${payload.jobId}/result`;
    const send = (body) =>
      request(app.getHttpServer())
        .post(endpoint)
        .set('X-Transcoding-Token', secret)
        .send(body);
    await send({ leaseToken: randomUUID() }).expect(400);
    await send({
      leaseToken: randomUUID(),
      result: { ...result, success: 'true' },
    }).expect(400);
    await send({
      leaseToken: randomUUID(),
      result: { ...result, duration: -1 },
    }).expect(400);
    await send({ leaseToken: randomUUID(), result }).expect(200);
  });
});
