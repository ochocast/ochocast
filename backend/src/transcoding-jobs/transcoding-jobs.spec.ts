import {
  BadRequestException,
  ConflictException,
  GoneException,
  INestApplication,
} from '@nestjs/common';
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
import { VideoEntity } from '../videos/infra/gateways/entities/video.entity';
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
    const manager = {
      getRepository: () => repository,
      save: repository.save,
      update,
    };
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
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  const permanent = (
    reason: string,
    error: string,
    duration = 0,
  ): VideoTranscodingResult => ({
    ...result,
    success: false,
    duration,
    error,
    permanent: true,
    reason,
  });

  it('acknowledges redeliveries of a permanent failure without a new attempt', async () => {
    await service.claim(payload.jobId, payload.videoId);
    await service.complete(
      payload.jobId,
      stored.leaseToken,
      permanent('invalid_source', 'Source has no video stream'),
    );
    expect(stored.status).toBe('failed');
    expect(update).toHaveBeenLastCalledWith(VideoEntity, payload.videoId, {
      transcoding_status: 'failed',
      transcoding_error: 'Source has no video stream',
    });
    expect(await service.claim(payload.jobId, payload.videoId)).toEqual({
      status: 'completed',
    });
    expect(stored.attempts).toBe(1);
  });

  it('abandons a job claimed TRANSCODING_MAX_ATTEMPTS times instead of running it again', async () => {
    stored.attempts = 10;
    stored.status = 'failed';
    expect(await service.claim(payload.jobId, payload.videoId)).toEqual({
      status: 'completed',
    });
    expect(stored.attempts).toBe(10);
    expect(stored.status).toBe('failed');
    expect(stored.result).toEqual(
      expect.objectContaining({
        success: false,
        permanent: true,
        error: 'Transcoding abandoned after 10 attempts',
      }),
    );
    expect(update).toHaveBeenCalledWith(VideoEntity, payload.videoId, {
      transcoding_status: 'failed',
      transcoding_error: 'Transcoding abandoned after 10 attempts',
    });
    // The next redelivery is acknowledged from the stored permanent failure.
    update.mockClear();
    expect(await service.claim(payload.jobId, payload.videoId)).toEqual({
      status: 'completed',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('honours TRANSCODING_MAX_ATTEMPTS and rejects an invalid value', async () => {
    const previous = process.env.TRANSCODING_MAX_ATTEMPTS;
    const build = () =>
      new TranscodingJobsService({
        transaction: (callback) =>
          callback({
            getRepository: () => ({ findOne, save: jest.fn() }),
            save: jest.fn(),
            update,
          }),
      } as unknown as DataSource);
    try {
      process.env.TRANSCODING_MAX_ATTEMPTS = '2';
      stored.attempts = 2;
      expect(await build().claim(payload.jobId, payload.videoId)).toEqual({
        status: 'completed',
      });
      process.env.TRANSCODING_MAX_ATTEMPTS = '0';
      expect(build).toThrow('TRANSCODING_MAX_ATTEMPTS');
    } finally {
      if (previous === undefined) delete process.env.TRANSCODING_MAX_ATTEMPTS;
      else process.env.TRANSCODING_MAX_ATTEMPTS = previous;
    }
  });

  it.each(['duration_exceeded', 'deadline_exceeded'])(
    'plays a playable source when the video is too long to transcode (%s)',
    async (reason) => {
      stored.payload = {
        ...payload,
        originalKey: `${payload.videoId}/source/original.mp4`,
      };
      await service.claim(payload.jobId, payload.videoId);
      await service.complete(payload.jobId, stored.leaseToken, {
        ...permanent(reason, 'too long', 5400),
        sourceCodecsPlayable: true,
      });
      expect(update).toHaveBeenLastCalledWith(VideoEntity, payload.videoId, {
        media_id: `${payload.videoId}/source/original.mp4`,
        transcoding_status: 'ready',
        transcoding_error: null,
        duration: 5400,
      });
      expect(stored.status).toBe('failed');
      expect(stored.result.permanent).toBe(true);
      expect(await service.claim(payload.jobId, payload.videoId)).toEqual({
        status: 'completed',
      });
    },
  );

  it('keeps extracted audio when a long video is played from its source', async () => {
    stored.payload = {
      ...payload,
      originalKey: `${payload.videoId}/source/original.mp4`,
    };
    await service.claim(payload.jobId, payload.videoId);
    await service.complete(payload.jobId, stored.leaseToken, {
      ...permanent('duration_exceeded', 'too long', 5400),
      sourceCodecsPlayable: true,
      has_audio: true,
      audio_key: `${payload.videoId}/audio.flac`,
    });
    expect(update).toHaveBeenLastCalledWith(
      VideoEntity,
      payload.videoId,
      expect.objectContaining({
        transcoding_status: 'ready',
        has_audio: true,
        audio_key: `${payload.videoId}/audio.flac`,
        transcription_status: 'pending',
      }),
    );
  });

  it('fails a too long video whose source browsers cannot play', async () => {
    stored.payload = {
      ...payload,
      originalKey: `${payload.videoId}/source/original.mkv`,
    };
    await service.claim(payload.jobId, payload.videoId);
    await service.complete(
      payload.jobId,
      stored.leaseToken,
      permanent('duration_exceeded', 'Video duration 5400 s exceeds the limit'),
    );
    expect(update).toHaveBeenLastCalledWith(VideoEntity, payload.videoId, {
      transcoding_status: 'failed',
      transcoding_error:
        'Video duration 5400 s exceeds the limit; a .mkv source cannot be played without transcoding',
    });
  });

  // false: HEVC, 10-bit... as probed. Absent: a worker that did not probe.
  it.each([false, undefined])(
    'fails a too long .mov whose codecs browsers cannot decode (sourceCodecsPlayable: %s)',
    async (sourceCodecsPlayable) => {
      stored.payload = {
        ...payload,
        originalKey: `${payload.videoId}/source/original.mov`,
      };
      await service.claim(payload.jobId, payload.videoId);
      await service.complete(payload.jobId, stored.leaseToken, {
        ...permanent('deadline_exceeded', 'Transcoding deadline exceeded'),
        sourceCodecsPlayable,
      });
      expect(update).toHaveBeenLastCalledWith(VideoEntity, payload.videoId, {
        transcoding_status: 'failed',
        transcoding_error:
          'Transcoding deadline exceeded; the source codecs cannot be played without transcoding',
      });
    },
  );

  // 410, not 404: the worker must tell a deleted job from a missing route.
  it('reports a deleted job as gone on claim and result', async () => {
    findOne.mockResolvedValue(null);
    await expect(
      service.claim(payload.jobId, payload.videoId),
    ).rejects.toBeInstanceOf(GoneException);
    await expect(
      service.complete(payload.jobId, randomUUID(), result),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it.each([
    [true, 'audio.wav', 'pending'],
    [false, null, 'no_audio'],
  ])(
    'persists audio availability for automatic transcription',
    async (has_audio, audio_key, status) => {
      await service.claim(payload.jobId, payload.videoId);
      await service.complete(payload.jobId, stored.leaseToken, {
        ...result,
        has_audio,
        audio_key,
      });
      expect(update).toHaveBeenLastCalledWith(
        expect.anything(),
        payload.videoId,
        expect.objectContaining({
          has_audio,
          audio_key,
          transcription_status: status,
        }),
      );
    },
  );
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

  it('fails closed without a usable callback secret, as when transcoding is disabled', async () => {
    const claim = (token?: string) => {
      const call = request(app.getHttpServer())
        .post(`/api/internal/transcoding/jobs/${payload.jobId}/claim`)
        .send({ videoId: payload.videoId });
      return token === undefined
        ? call
        : call.set('X-Transcoding-Token', token);
    };
    jobs.claim.mockClear();
    jobs.complete.mockClear();
    try {
      delete process.env.TRANSCODING_CALLBACK_SECRET;
      await claim().expect(401);
      await claim('').expect(401);
      await claim(secret).expect(401);
      await request(app.getHttpServer())
        .post(`/api/internal/transcoding/jobs/${payload.jobId}/result`)
        .set('X-Transcoding-Token', secret)
        .send({ leaseToken: randomUUID(), result })
        .expect(401);
      process.env.TRANSCODING_CALLBACK_SECRET = 'short-secret';
      await claim('short-secret').expect(401);
      expect(jobs.claim).not.toHaveBeenCalled();
      expect(jobs.complete).not.toHaveBeenCalled();
    } finally {
      process.env.TRANSCODING_CALLBACK_SECRET = secret;
    }
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

  it('accepts the permanent failure fields of the worker', async () => {
    const endpoint = `/api/internal/transcoding/jobs/${payload.jobId}/result`;
    const send = (extra: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(endpoint)
        .set('X-Transcoding-Token', secret)
        .send({
          leaseToken: randomUUID(),
          result: { ...result, success: false, error: 'too long', ...extra },
        });
    jobs.complete.mockClear();
    await send({ permanent: true, reason: 'duration_exceeded' }).expect(200);
    expect(jobs.complete).toHaveBeenCalledWith(
      payload.jobId,
      expect.any(String),
      expect.objectContaining({ permanent: true, reason: 'duration_exceeded' }),
    );
    await send({ permanent: 'yes' }).expect(400);
    await send({ reason: 'x'.repeat(65) }).expect(400);
    jobs.complete.mockClear();
    await send({
      permanent: true,
      reason: 'deadline_exceeded',
      sourceCodecsPlayable: false,
    }).expect(200);
    expect(jobs.complete).toHaveBeenCalledWith(
      payload.jobId,
      expect.any(String),
      expect.objectContaining({ sourceCodecsPlayable: false }),
    );
    await send({ sourceCodecsPlayable: 'true' }).expect(400);
  });

  it('answers 410 Gone for a deleted job on claim and result', async () => {
    const gone = new GoneException('Transcoding job not found');
    jobs.claim.mockRejectedValueOnce(gone);
    jobs.complete.mockRejectedValueOnce(gone);
    await request(app.getHttpServer())
      .post(`/api/internal/transcoding/jobs/${payload.jobId}/claim`)
      .set('X-Transcoding-Token', secret)
      .send({ videoId: payload.videoId })
      .expect(410);
    await request(app.getHttpServer())
      .post(`/api/internal/transcoding/jobs/${payload.jobId}/result`)
      .set('X-Transcoding-Token', secret)
      .send({ leaseToken: randomUUID(), result })
      .expect(410);
  });
});
