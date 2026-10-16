import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';
import { UploadsService } from 'src/videos/uploads/uploads.service';
import { MultipartStorage } from 'src/videos/uploads/multipart-storage';
import { VideoUpload } from 'src/videos/uploads/upload.entity';
import { TranscodingJobsService } from 'src/transcoding-jobs/transcoding-jobs.service';
import { TranscodingJobEntity } from 'src/transcoding-jobs/transcoding-job.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';

describe('Upload maintenance with and without a transcoding queue', () => {
  let expired: VideoUpload[];
  let pending: VideoUpload[];
  let stale: TranscodingJobEntity[];
  let builders: Record<string, any>;
  let manager: {
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
  };
  let db: { transaction: jest.Mock; getRepository: jest.Mock };
  let storage: { abort: jest.Mock; remove: jest.Mock };
  let warn: jest.SpyInstance;
  const publishRegisteredJob = jest.fn();
  const chain = (name: string, rows: () => unknown[]) => {
    const builder = {
      calls: {} as Record<string, unknown[][]>,
      getMany: jest.fn(async () => rows()),
    };
    for (const method of [
      'setLock',
      'setOnLocked',
      'innerJoin',
      'where',
      'orderBy',
      'take',
      'limit',
    ])
      builder[method] = (...args: unknown[]) => {
        (builder.calls[method] ||= []).push(args);
        return builder;
      };
    builders[name] = builder;
    return builder;
  };
  const service = (enabled: boolean) =>
    new UploadsService(
      db as unknown as DataSource,
      storage as unknown as MultipartStorage,
      { enabled, publishRegisteredJob } as any,
      {} as TranscodingJobsService,
    );
  const job = (overrides: Partial<TranscodingJobEntity>) =>
    Object.assign(new TranscodingJobEntity(), {
      id: 'job',
      videoId: 'job',
      payload: { jobId: 'job', videoId: 'job', timestamp: 1 },
      status: 'pending',
      attempts: 0,
      leaseToken: null,
      leaseExpiresAt: null,
      result: null,
      ...overrides,
    });

  beforeEach(() => {
    publishRegisteredJob.mockReset();
    builders = {};
    expired = [{ id: 'expired', state: 'uploading' } as VideoUpload];
    pending = [];
    stale = [];
    manager = {
      createQueryBuilder: jest.fn((entity) =>
        entity === TranscodingJobEntity
          ? chain('jobs', () => stale)
          : chain('expired', () => expired),
      ),
      save: jest.fn(),
      update: jest.fn(),
      // dispatch() of an upload still waiting for its first publication.
      findOne: jest.fn(async (_entity, { where }) => ({
        id: where.id,
        state: 'uploaded',
      })),
      findOneBy: jest.fn(async (_entity, { id }) =>
        job({ id, payload: { jobId: id } as any }),
      ),
    };
    db = {
      transaction: jest.fn(async (work) => work(manager)),
      getRepository: jest.fn(() => ({
        createQueryBuilder: () => chain('pending', () => pending),
      })),
    };
    storage = { abort: jest.fn(), remove: jest.fn() };
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.TRANSCODING_REDISPATCH_AFTER_SECONDS;
    delete process.env.TRANSCODING_MAX_ATTEMPTS;
  });

  it('still aborts expired sessions but never queries dispatches while disabled', async () => {
    await service(false).maintain();
    expect(storage.abort).toHaveBeenCalledWith(expired[0]);
    expect(storage.remove).toHaveBeenCalledWith(expired[0]);
    expect(expired[0].state).toBe('aborted');
    expect(db.getRepository).not.toHaveBeenCalled();
    expect(publishRegisteredJob).not.toHaveBeenCalled();
  });

  it('looks for uploads waiting for publication when enabled', async () => {
    await service(true).maintain();
    expect(db.getRepository).toHaveBeenCalledWith(VideoUpload);
  });

  it('expires the oldest sessions first', async () => {
    await service(false).maintain();
    expect(builders.expired.calls.orderBy).toEqual([['s.expiresAt', 'ASC']]);
  });

  it('dates each re-dispatch so reconciliation waits a full delay', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(42);
    pending = [{ id: 'waiting' } as VideoUpload];
    await service(true).maintain();
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'waiting',
        payload: { jobId: 'waiting', timestamp: 42 },
      }),
    );
    expect(publishRegisteredJob).toHaveBeenCalledWith({
      jobId: 'waiting',
      timestamp: 42,
    });
  });

  it('re-dispatches waiting uploads even when the expiry sweep fails', async () => {
    storage.abort.mockRejectedValue(new Error('Access Denied'));
    pending = [{ id: 'waiting' } as VideoUpload];
    await service(true).maintain();
    expect(publishRegisteredJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'waiting' }),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Access Denied'));
  });

  it('re-dispatches waiting uploads even when job reconciliation fails', async () => {
    manager.createQueryBuilder.mockImplementation((entity) => {
      if (entity === TranscodingJobEntity) throw new Error('jobs down');
      return chain('expired', () => expired);
    });
    pending = [{ id: 'waiting' } as VideoUpload];
    await service(true).maintain();
    expect(publishRegisteredJob).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'waiting' }),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('jobs down'));
  });

  it('reconciles jobs even when the re-dispatch query fails', async () => {
    db.getRepository.mockImplementation(() => {
      throw new Error('uploads down');
    });
    stale = [job({ id: 'lost' })];
    await service(true).maintain();
    expect(publishRegisteredJob).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('uploads down'));
  });

  describe('reconciliation of lost or dead-lettered jobs', () => {
    const now = 10_000_000_000;
    beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(now));

    it('locks a bounded batch of stale jobs not waiting for their first dispatch', async () => {
      await service(true).maintain();
      const { calls } = builders.jobs;
      expect(calls.setLock).toEqual([['pessimistic_write']]);
      expect(calls.setOnLocked).toEqual([['skip_locked']]);
      expect(calls.limit).toEqual([[10]]);
      expect(calls.orderBy).toEqual([
        ["(job.payload->>'timestamp')::bigint", 'ASC'],
      ]);
      const [[where, params]] = calls.where;
      expect(where).toContain("job.status = 'processing'");
      expect(where).toContain("job.status = 'pending'");
      // A failure marked retryable whose message may be dead-lettered, after
      // the same delay as a lost pending job. Permanent failures, and those an
      // older backend recorded without the marker, are final.
      expect(where).toContain(
        "(job.status = 'failed' AND job.result->>'retryable' = 'true'" +
          " AND (job.payload->>'timestamp')::bigint < :pendingCutoff)",
      );
      expect(where).not.toContain("job.result->>'permanent'");
      // Recordings have no upload row: NOT EXISTS keeps them candidates.
      expect(where).toMatch(
        /NOT EXISTS \(SELECT 1 FROM video_upload u WHERE u\.id = job\.id AND u\.state = 'uploaded'\)/,
      );
      expect(params).toEqual({
        leaseCutoff: new Date(now - 10 * 60_000),
        pendingCutoff: now - 7200 * 1000,
      });
    });

    it('honours TRANSCODING_REDISPATCH_AFTER_SECONDS', async () => {
      process.env.TRANSCODING_REDISPATCH_AFTER_SECONDS = '600';
      await service(true).maintain();
      expect(builders.jobs.calls.where[0][1].pendingCutoff).toBe(now - 600_000);
    });

    it.each([
      ['TRANSCODING_REDISPATCH_AFTER_SECONDS', '0'],
      ['TRANSCODING_REDISPATCH_AFTER_SECONDS', '1.5'],
      ['TRANSCODING_MAX_ATTEMPTS', '0'],
      ['TRANSCODING_MAX_ATTEMPTS', 'ten'],
    ])('refuses %s=%s', (name, value) => {
      process.env[name] = value;
      expect(() => service(true)).toThrow(`${name} must be a positive integer`);
    });

    it('republishes a lost pending job with a fresh timestamp', async () => {
      stale = [
        job({
          id: 'lost',
          videoId: 'video',
          payload: { jobId: 'lost', timestamp: 1 } as any,
        }),
      ];
      await service(true).maintain();
      expect(publishRegisteredJob).toHaveBeenCalledWith({
        jobId: 'lost',
        timestamp: now,
      });
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'lost',
          status: 'pending',
          payload: { jobId: 'lost', timestamp: now },
        }),
      );
      // Will run again: a video an older backend failed when the first
      // publication of a recording failed is pending again.
      expect(manager.update).toHaveBeenCalledWith(
        VideoEntity,
        { id: 'video', transcoding_status: 'failed' },
        { transcoding_status: 'pending', transcoding_error: null },
      );
    });

    it('republishes a processing job whose lease expired long ago', async () => {
      stale = [
        job({
          id: 'crashed',
          status: 'processing',
          attempts: 3,
          leaseToken: 'token',
          leaseExpiresAt: new Date(0),
        }),
      ];
      await service(true).maintain();
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'crashed',
          status: 'pending',
          attempts: 3,
          leaseToken: null,
          leaseExpiresAt: null,
        }),
      );
      expect(publishRegisteredJob).toHaveBeenCalledTimes(1);
    });

    it('marks the job and its video failed once attempts are exhausted', async () => {
      process.env.TRANSCODING_MAX_ATTEMPTS = '4';
      stale = [
        job({
          id: 'doomed',
          videoId: 'video',
          status: 'processing',
          attempts: 4,
          leaseToken: 'token',
          leaseExpiresAt: new Date(0),
        }),
      ];
      await service(true).maintain();
      const error = 'Transcoding abandoned after 4 attempts';
      expect(publishRegisteredJob).not.toHaveBeenCalled();
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'doomed',
          status: 'failed',
          leaseExpiresAt: null,
          // Final like claim's abandonment: redeliveries are acknowledged.
          result: expect.objectContaining({
            success: false,
            error,
            permanent: true,
            reason: 'max_attempts',
          }),
        }),
      );
      // Only the reason code reaches the public video row.
      expect(manager.update).toHaveBeenCalledWith(VideoEntity, 'video', {
        transcoding_status: 'failed',
        transcoding_error: 'max_attempts',
      });
    });

    it('keeps published jobs and leaves a refused one untouched for the next sweep', async () => {
      stale = [
        job({ id: 'sent' }),
        job({ id: 'refused' }),
        job({ id: 'later' }),
      ];
      publishRegisteredJob
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('queue down'));
      await service(true).maintain();
      const batch = ['sent', 'refused', 'later'];
      const saved = manager.save.mock.calls
        .map(([j]) => j.id)
        .filter((id) => batch.includes(id));
      expect(saved).toEqual(['sent']);
      // An outage likely refuses the rest too: stop until the next sweep.
      expect(publishRegisteredJob).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('queue down'));
    });

    it('never sweeps jobs while the queue is disabled', async () => {
      stale = [job({ id: 'lost' })];
      await service(false).maintain();
      expect(manager.createQueryBuilder).not.toHaveBeenCalledWith(
        TranscodingJobEntity,
        expect.anything(),
      );
      expect(publishRegisteredJob).not.toHaveBeenCalled();
    });
  });
});
