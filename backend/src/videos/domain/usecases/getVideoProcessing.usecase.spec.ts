import { NotFoundException } from '@nestjs/common';
import { GetVideoProcessingUsecase } from './getVideoProcessing.usecase';
import { IVideoProcessingGateway } from '../gateways/videoProcessing.gateway';
import { ProcessingJob, ProcessingVideo } from '../videoProcessing';

describe('Processing state of a video (GET /videos/:id/processing)', () => {
  const now = Date.parse('2026-10-16T12:00:00.000Z');
  const createdAt = new Date('2026-10-16T11:50:00.000Z');
  let gateway: jest.Mocked<IVideoProcessingGateway>;
  const video = (fields: Partial<ProcessingVideo> = {}): ProcessingVideo => ({
    transcoding_status: 'pending',
    transcoding_error: null,
    media_id: 'video/master.m3u8',
    createdAt,
    ...fields,
  });
  const job = (fields: Partial<ProcessingJob> = {}): ProcessingJob => ({
    status: 'pending',
    attempts: 0,
    leaseExpiresAt: null,
    result: null,
    ...fields,
  });
  const given = (v: ProcessingVideo | null, j: ProcessingJob | null = null) => {
    gateway.findVideo.mockResolvedValue(v);
    gateway.findJob.mockResolvedValue(j);
  };
  const run = () => new GetVideoProcessingUsecase(gateway).execute('id', now);
  const state = (fields: Record<string, unknown>) => ({
    since: null,
    reason: null,
    playedFromSource: false,
    ...fields,
  });

  beforeEach(() => {
    gateway = { findVideo: jest.fn(), findJob: jest.fn() };
  });
  afterEach(() => {
    delete process.env.TRANSCODING_LEASE_SECONDS;
    delete process.env.TRANSCODING_MAX_ATTEMPTS;
  });

  it('answers 404 for a missing or archived video', async () => {
    given(null);
    await expect(run()).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.findVideo).toHaveBeenCalledWith('id');
    expect(gateway.findJob).not.toHaveBeenCalled();
  });

  describe('ready', () => {
    it('is ready with HLS renditions, without reading the job', async () => {
      given(video({ transcoding_status: 'ready' }));
      expect(await run()).toEqual(state({ state: 'ready' }));
      expect(gateway.findJob).not.toHaveBeenCalled();
    });

    it('flags a video played from its source', async () => {
      given(
        video({
          transcoding_status: 'ready',
          media_id: 'video/source/original.mp4',
        }),
        job({
          status: 'failed',
          attempts: 1,
          result: { permanent: true, reason: 'duration_exceeded' },
        }),
      );
      expect(await run()).toEqual(
        state({ state: 'ready', playedFromSource: true }),
      );
    });
  });

  describe('queued', () => {
    it('is queued since its creation without a job', async () => {
      given(video());
      expect(await run()).toEqual(
        state({ state: 'queued', since: createdAt.toISOString() }),
      );
    });

    // Upload still 'uploaded': its job is registered in the same transaction,
    // pending and never claimed until the publication succeeds.
    it('is queued while its job waits for a first claim', async () => {
      given(video(), job());
      expect(await run()).toEqual(
        state({ state: 'queued', since: createdAt.toISOString() }),
      );
    });

    // A recording an older backend failed when its first publication failed:
    // the job is registered and reconciliation republishes it.
    it('is queued when its first publication failed but the job is registered', async () => {
      given(
        video({
          transcoding_status: 'failed',
          transcoding_error: 'Queue down',
        }),
        job(),
      );
      expect(await run()).toEqual(
        state({ state: 'queued', since: createdAt.toISOString() }),
      );
    });
  });

  describe('processing', () => {
    it('is processing since the start of the live lease', async () => {
      given(
        video(),
        job({
          status: 'processing',
          attempts: 1,
          leaseExpiresAt: new Date(now + 3000_000),
        }),
      );
      expect(await run()).toEqual(
        state({
          state: 'processing',
          since: new Date(now - 600_000).toISOString(),
        }),
      );
    });

    it('honours TRANSCODING_LEASE_SECONDS and never dates the start in the future', async () => {
      process.env.TRANSCODING_LEASE_SECONDS = '600';
      given(
        video(),
        job({
          status: 'processing',
          attempts: 1,
          leaseExpiresAt: new Date(now + 300_000),
        }),
      );
      expect((await run()).since).toBe(new Date(now - 300_000).toISOString());
      // Claimed under a longer lease than the configured one.
      gateway.findJob.mockResolvedValue(
        job({
          status: 'processing',
          attempts: 1,
          leaseExpiresAt: new Date(now + 3600_000),
        }),
      );
      expect((await run()).since).toBe(new Date(now).toISOString());
    });
  });

  describe('retrying', () => {
    it('is retrying after a failure the backend marked retryable', async () => {
      given(
        video(),
        job({ status: 'failed', attempts: 3, result: { retryable: true } }),
      );
      expect(await run()).toEqual(state({ state: 'retrying' }));
    });

    it('is retrying when its worker died (expired lease)', async () => {
      given(
        video(),
        job({
          status: 'processing',
          attempts: 2,
          leaseExpiresAt: new Date(now - 1000),
        }),
      );
      expect(await run()).toEqual(state({ state: 'retrying' }));
    });

    it('is retrying once republished after an attempt', async () => {
      given(video(), job({ status: 'pending', attempts: 2 }));
      expect(await run()).toEqual(state({ state: 'retrying' }));
    });
  });

  describe('failed', () => {
    it.each([
      'invalid_source',
      'source_too_large',
      'duration_exceeded',
      'deadline_exceeded',
      'max_attempts',
    ])('reports the permanent reason %s', async (reason) => {
      given(
        video({ transcoding_status: 'failed', transcoding_error: reason }),
        job({
          status: 'failed',
          attempts: 1,
          result: { permanent: true, reason },
        }),
      );
      expect(await run()).toEqual(state({ state: 'failed', reason }));
    });

    it('reports unknown for a permanent failure without a known reason', async () => {
      given(
        video({ transcoding_status: 'failed', transcoding_error: 'unknown' }),
        job({
          status: 'failed',
          attempts: 1,
          result: { permanent: true, reason: '/tmp/secret path' },
        }),
      );
      expect(await run()).toEqual(
        state({ state: 'failed', reason: 'unknown' }),
      );
    });

    // Its worker died during the last allowed attempt: the next claim or
    // reconciliation abandons the job, no attempt will run again.
    it('reports max_attempts when the last allowed attempt lost its worker', async () => {
      process.env.TRANSCODING_MAX_ATTEMPTS = '3';
      given(
        video(),
        job({
          status: 'processing',
          attempts: 3,
          leaseExpiresAt: new Date(now - 1000),
        }),
      );
      expect(await run()).toEqual(
        state({ state: 'failed', reason: 'max_attempts' }),
      );
    });

    it('keeps the last allowed attempt processing while its lease is live', async () => {
      process.env.TRANSCODING_MAX_ATTEMPTS = '3';
      given(
        video(),
        job({
          status: 'processing',
          attempts: 3,
          leaseExpiresAt: new Date(now + 3000_000),
        }),
      );
      expect((await run()).state).toBe('processing');
    });

    it('reports max_attempts once the attempts are spent', async () => {
      process.env.TRANSCODING_MAX_ATTEMPTS = '3';
      given(
        video({ transcoding_status: 'failed' }),
        job({ status: 'failed', attempts: 3, result: { retryable: true } }),
      );
      expect(await run()).toEqual(
        state({ state: 'failed', reason: 'max_attempts' }),
      );
    });

    // Recorded before retries were marked (no retryable flag): an invalid
    // source among them. Final, never retried nor shown as processing.
    it.each([
      ['without a result flag', {}],
      ['marked not permanent by a worker', { permanent: false }],
      ['without a result', null],
    ])(
      'reports unknown for a failure an older backend left %s',
      async (_, result) => {
        given(
          video({
            transcoding_status: 'failed',
            transcoding_error: 'ffmpeg exited 1 at /tmp/x',
          }),
          job({ status: 'failed', attempts: 1, result }),
        );
        expect(await run()).toEqual(
          state({ state: 'failed', reason: 'unknown' }),
        );
      },
    );

    it.each([
      ['source_too_large', 'source_too_large'],
      ['Error: ffmpeg exited 1 at /tmp/x (TRANSCODING_SECRET)', 'unknown'],
      [null, 'unknown'],
    ])(
      'whitelists the stored error %s of a failed video without a job',
      async (stored, reason) => {
        given(
          video({ transcoding_status: 'failed', transcoding_error: stored }),
        );
        expect(await run()).toEqual(state({ state: 'failed', reason }));
      },
    );
  });
});
