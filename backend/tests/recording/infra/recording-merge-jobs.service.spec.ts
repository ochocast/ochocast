import { ConflictException, GoneException } from '@nestjs/common';
import { RecordingMergeJobsService } from 'src/recording/infra/merge-jobs/recording-merge-jobs.service';
import { RecordingMergeJobEntity } from 'src/recording/infra/merge-jobs/recording-merge-job.entity';
import { RecordingEntity } from 'src/recording/infra/gateways/entities/recording.entity';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const RECORDING_ID = '22222222-2222-4222-8222-222222222222';

/** In-memory stand-in for the transaction manager used by the service. */
function fakeDataSource(row: Partial<RecordingMergeJobEntity> | null) {
  const recordingUpdates: unknown[] = [];
  const state = { row };
  const repository = {
    findOne: jest.fn(async () => (state.row ? { ...state.row } : null)),
    save: jest.fn(async (saved) => {
      state.row = { ...saved };
      return saved;
    }),
  };
  const manager = {
    getRepository: (entity: unknown) => {
      expect(entity).toBe(RecordingMergeJobEntity);
      return repository;
    },
    update: jest.fn(async (entity: unknown, id: string, changes: unknown) => {
      expect(entity).toBe(RecordingEntity);
      expect(id).toBe(RECORDING_ID);
      recordingUpdates.push(changes);
    }),
  };
  const dataSource = {
    transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
  } as any;
  return { dataSource, state, recordingUpdates };
}

const pendingJob = (overrides: Partial<RecordingMergeJobEntity> = {}) => ({
  id: JOB_ID,
  recordingId: RECORDING_ID,
  payload: { jobId: JOB_ID, recordingId: RECORDING_ID } as any,
  status: 'pending' as const,
  leaseToken: null,
  leaseExpiresAt: null,
  attempts: 0,
  result: null,
  ...overrides,
});

const result = (success: boolean, permanent?: boolean) => ({
  jobId: JOB_ID,
  recordingId: RECORDING_ID,
  success,
  duration: success ? 125 : 0,
  processedAt: Date.now(),
  ...(permanent ? { permanent } : {}),
});

const runningJob = (overrides: Partial<RecordingMergeJobEntity> = {}) =>
  pendingJob({
    status: 'processing',
    leaseToken: 'lease',
    leaseExpiresAt: new Date(Date.now() + 60_000),
    attempts: 1,
    ...overrides,
  });

describe('RecordingMergeJobsService', () => {
  it('claims a pending job with a lease', async () => {
    const { dataSource, state } = fakeDataSource(pendingJob());
    const service = new RecordingMergeJobsService(dataSource);

    const claim = await service.claim(JOB_ID, RECORDING_ID);

    expect(claim.status).toBe('claimed');
    expect(state.row.status).toBe('processing');
    expect(state.row.attempts).toBe(1);
  });

  it('answers 410 for a deleted montage', async () => {
    const { dataSource } = fakeDataSource(null);
    const service = new RecordingMergeJobsService(dataSource);

    await expect(service.claim(JOB_ID, RECORDING_ID)).rejects.toThrow(
      GoneException,
    );
  });

  it('refuses a second claim while the lease is running', async () => {
    const { dataSource } = fakeDataSource(
      pendingJob({ leaseExpiresAt: new Date(Date.now() + 60_000) }),
    );
    const service = new RecordingMergeJobsService(dataSource);

    await expect(service.claim(JOB_ID, RECORDING_ID)).rejects.toThrow(
      ConflictException,
    );
  });

  it('gives up after the maximum number of attempts', async () => {
    const { dataSource, recordingUpdates } = fakeDataSource(
      pendingJob({ attempts: 5 }),
    );
    const service = new RecordingMergeJobsService(dataSource);

    expect(await service.claim(JOB_ID, RECORDING_ID)).toEqual({
      status: 'completed',
    });
    expect(recordingUpdates).toEqual([{ status: 'failed' }]);
  });

  it('marks the montage ready with its duration on success', async () => {
    const { dataSource, recordingUpdates } = fakeDataSource(
      pendingJob({
        status: 'processing',
        leaseToken: 'lease',
        leaseExpiresAt: new Date(Date.now() + 60_000),
      }),
    );
    const service = new RecordingMergeJobsService(dataSource);

    await service.complete(JOB_ID, 'lease', result(true));

    expect(recordingUpdates).toEqual([{ status: 'ready', duration: 125 }]);
  });

  it('never lets a late failure overwrite a success', async () => {
    const { dataSource, recordingUpdates } = fakeDataSource(
      pendingJob({ status: 'ready' }),
    );
    const service = new RecordingMergeJobsService(dataSource);

    await service.complete(JOB_ID, 'old-lease', result(false));

    expect(recordingUpdates).toEqual([]);
  });

  it('keeps the montage processing while a transient failure is retried', async () => {
    const { dataSource, state, recordingUpdates } =
      fakeDataSource(runningJob());
    const service = new RecordingMergeJobsService(dataSource);

    await service.complete(JOB_ID, 'lease', result(false));

    expect(state.row.status).toBe('pending');
    expect(recordingUpdates).toEqual([]);
    // The redelivered message claims it again.
    expect((await service.claim(JOB_ID, RECORDING_ID)).status).toBe('claimed');
  });

  it('fails the montage for good on a permanent failure', async () => {
    const { dataSource, state, recordingUpdates } =
      fakeDataSource(runningJob());
    const service = new RecordingMergeJobsService(dataSource);

    await service.complete(JOB_ID, 'lease', result(false, true));

    expect(state.row.status).toBe('failed');
    expect(recordingUpdates).toEqual([{ status: 'failed' }]);
    // Never claimed again, even if the message comes back.
    expect(await service.claim(JOB_ID, RECORDING_ID)).toEqual({
      status: 'completed',
    });
  });

  it('fails the montage once the last attempt failed', async () => {
    const { dataSource, recordingUpdates } = fakeDataSource(
      runningJob({ attempts: 5 }),
    );
    const service = new RecordingMergeJobsService(dataSource);

    await service.complete(JOB_ID, 'lease', result(false));

    expect(recordingUpdates).toEqual([{ status: 'failed' }]);
  });

  it('ignores a repeated failure callback of the same lease', async () => {
    const { dataSource, recordingUpdates } = fakeDataSource(runningJob());
    const service = new RecordingMergeJobsService(dataSource);

    await service.complete(JOB_ID, 'lease', result(false, true));
    await service.complete(JOB_ID, 'lease', result(false, true));

    expect(recordingUpdates).toEqual([{ status: 'failed' }]);
  });

  it('rejects a result from an expired lease', async () => {
    const { dataSource } = fakeDataSource(
      pendingJob({
        status: 'processing',
        leaseToken: 'lease',
        leaseExpiresAt: new Date(Date.now() - 1_000),
      }),
    );
    const service = new RecordingMergeJobsService(dataSource);

    await expect(
      service.complete(JOB_ID, 'lease', result(true)),
    ).rejects.toThrow(ConflictException);
  });
});
