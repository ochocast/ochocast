import {
  BadRequestException,
  ConflictException,
  GoneException,
} from '@nestjs/common';
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { VideoEditRenderJobsService } from 'src/video-edits/infra/render-jobs/video-edit-render-jobs.service';
import { VideoEditRenderJobEntity } from 'src/video-edits/infra/render-jobs/video-edit-render-job.entity';
import { VideoEditEntity } from 'src/video-edits/infra/gateways/entities/video-edit.entity';

const JOB_ID = '11111111-1111-4111-8111-111111111111';
const EDIT_ID = '22222222-2222-4222-8222-222222222222';
const VIDEO_ID = '33333333-3333-4333-8333-333333333333';
const MASTER = `${VIDEO_ID}/edits/${JOB_ID}/master.m3u8`;

/**
 * In-memory stand-in for the transaction manager: one job row and its
 * montage. Montage updates honour their criteria (version, status), as the
 * service relies on them to leave a newer version alone.
 */
function fakeDataSource(
  job: Partial<VideoEditRenderJobEntity> | null,
  edit: Partial<VideoEditEntity> | null,
) {
  const state = { job, edit };
  const jobRepository = {
    find: jest.fn(async () => (state.job ? [{ ...state.job }] : [])),
    findOne: jest.fn(async () => (state.job ? { ...state.job } : null)),
    save: jest.fn(async (saved) => {
      state.job = { ...saved };
      return saved;
    }),
    update: jest.fn(async (_criteria, changes) => {
      state.job = { ...state.job, ...changes };
    }),
  };
  const editRepository = {
    findOne: jest.fn(async () => (state.edit ? { ...state.edit } : null)),
  };
  const matches = (criteria: any) =>
    state.edit &&
    criteria.id === state.edit.id &&
    criteria.version === state.edit.version &&
    // In([...]) of TypeORM: a FindOperator holding the accepted values.
    criteria.render_status.value.includes(state.edit.render_status);
  const manager = {
    getRepository: (entity: unknown) => {
      expect(entity).toBe(VideoEditRenderJobEntity);
      return jobRepository;
    },
    findOne: jest.fn(async (entity: unknown) => {
      expect(entity).toBe(VideoEditEntity);
      return state.edit ? { ...state.edit } : null;
    }),
    update: jest.fn(async (entity: unknown, criteria: any, changes: any) => {
      expect(entity).toBe(VideoEditEntity);
      if (matches(criteria)) state.edit = { ...state.edit, ...changes };
    }),
  };
  const dataSource = {
    transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
    getRepository: (entity: unknown) =>
      entity === VideoEditEntity ? editRepository : jobRepository,
  } as any;
  return { dataSource, state };
}

const pendingJob = (overrides: Partial<VideoEditRenderJobEntity> = {}) => ({
  id: JOB_ID,
  editId: EDIT_ID,
  version: 2,
  payload: {
    jobId: JOB_ID,
    editId: EDIT_ID,
    videoId: VIDEO_ID,
    version: 2,
    timestamp: Date.now(),
    sourceKey: `${VIDEO_ID}/source/original.mp4`,
    outputPrefix: `${VIDEO_ID}/edits/${JOB_ID}`,
    segments: [],
  },
  status: 'pending' as const,
  leaseToken: null,
  leaseExpiresAt: null,
  attempts: 0,
  result: null,
  files_deleted_at: null,
  ...overrides,
});

const runningJob = (overrides: Partial<VideoEditRenderJobEntity> = {}) =>
  pendingJob({
    status: 'processing',
    leaseToken: 'lease',
    leaseExpiresAt: new Date(Date.now() + 60_000),
    attempts: 1,
    ...overrides,
  });

const montage = (overrides: Partial<VideoEditEntity> = {}) => ({
  id: EDIT_ID,
  videoId: VIDEO_ID,
  version: 2,
  render_status: 'pending' as const,
  render_error: null,
  rendered_media_id: null,
  rendered_duration: null,
  ...overrides,
});

const result = (success: boolean, extra: object = {}) => ({
  jobId: JOB_ID,
  editId: EDIT_ID,
  success,
  duration: success ? 125.5 : 0,
  processedAt: Date.now(),
  ...(success ? { mediaId: MASTER } : { error: 'ffmpeg crashed' }),
  ...extra,
});

describe('VideoEditRenderJobsService', () => {
  const s3 = { send: jest.fn() };
  const service = (dataSource: unknown) =>
    new VideoEditRenderJobsService(dataSource as any, s3 as any);

  beforeEach(() => s3.send.mockReset());

  describe('claim', () => {
    it('leases the job and marks the montage processing', async () => {
      const { dataSource, state } = fakeDataSource(pendingJob(), montage());

      const claim = await service(dataSource).claim(JOB_ID, EDIT_ID);

      expect(claim).toMatchObject({
        status: 'claimed',
        leaseToken: expect.any(String),
        job: { jobId: JOB_ID, outputPrefix: `${VIDEO_ID}/edits/${JOB_ID}` },
      });
      expect(state.job).toMatchObject({ status: 'processing', attempts: 1 });
      expect(state.edit.render_status).toBe('processing');
    });

    it('answers 410 for a deleted job and 409 while a lease runs', async () => {
      await expect(
        service(fakeDataSource(null, null).dataSource).claim(JOB_ID, EDIT_ID),
      ).rejects.toThrow(GoneException);
      await expect(
        service(fakeDataSource(runningJob(), montage()).dataSource).claim(
          JOB_ID,
          EDIT_ID,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it.each(['ready', 'failed'] as const)(
      'acknowledges a %s job without running it',
      async (status) => {
        const { dataSource } = fakeDataSource(
          pendingJob({ status }),
          montage(),
        );
        await expect(
          service(dataSource).claim(JOB_ID, EDIT_ID),
        ).resolves.toEqual({ status: 'completed' });
      },
    );

    it.each([
      ['a newer version', montage({ version: 3 })],
      ['a montage no longer rendering', montage({ render_status: 'failed' })],
    ])('never runs a job superseded by %s', async (_, edit) => {
      const { dataSource, state } = fakeDataSource(pendingJob(), edit);

      await expect(service(dataSource).claim(JOB_ID, EDIT_ID)).resolves.toEqual(
        { status: 'completed' },
      );
      expect(state.job).toMatchObject({
        status: 'failed',
        result: { error: 'Superseded by another render', permanent: true },
      });
      expect(state.edit).toEqual(edit);
    });

    it('abandons a job out of attempts and fails the montage', async () => {
      const { dataSource, state } = fakeDataSource(
        pendingJob({ attempts: 3 }),
        montage(),
      );

      await expect(service(dataSource).claim(JOB_ID, EDIT_ID)).resolves.toEqual(
        { status: 'completed' },
      );
      expect(state.job.status).toBe('failed');
      expect(state.edit).toMatchObject({
        render_status: 'failed',
        render_error: 'Render abandoned after 3 attempts',
      });
    });
  });

  describe('complete', () => {
    it('publishes the rendition to viewers on success', async () => {
      const { dataSource, state } = fakeDataSource(
        runningJob(),
        montage({
          render_status: 'processing',
          rendered_media_id: `${VIDEO_ID}/edits/previous/master.m3u8`,
        }),
      );

      await service(dataSource).complete(JOB_ID, 'lease', result(true));

      expect(state.job.status).toBe('ready');
      expect(state.edit).toMatchObject({
        render_status: 'ready',
        render_error: null,
        rendered_media_id: MASTER,
        rendered_duration: 125.5,
      });
    });

    it('refuses media outside the job folder', async () => {
      const { dataSource, state } = fakeDataSource(
        runningJob(),
        montage({ render_status: 'processing' }),
      );
      await expect(
        service(dataSource).complete(
          JOB_ID,
          'lease',
          result(true, { mediaId: `${VIDEO_ID}/master.m3u8` }),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(state.edit.rendered_media_id).toBeNull();
    });

    it('keeps the montage pending, with the error, between attempts', async () => {
      const previous = `${VIDEO_ID}/edits/previous/master.m3u8`;
      const { dataSource, state } = fakeDataSource(
        runningJob(),
        montage({ render_status: 'processing', rendered_media_id: previous }),
      );

      await service(dataSource).complete(JOB_ID, 'lease', result(false));

      expect(state.job.status).toBe('pending');
      expect(state.edit).toMatchObject({
        render_status: 'pending',
        render_error: 'ffmpeg crashed',
        // Viewers keep the previous version.
        rendered_media_id: previous,
      });
    });

    it.each([
      ['a permanent failure', runningJob(), { permanent: true }],
      ['the last attempt', runningJob({ attempts: 3 }), {}],
    ])('fails the montage on %s', async (_, job, extra) => {
      const { dataSource, state } = fakeDataSource(
        job,
        montage({ render_status: 'processing' }),
      );

      await service(dataSource).complete(JOB_ID, 'lease', result(false, extra));

      expect(state.job.status).toBe('failed');
      expect(state.edit).toMatchObject({
        render_status: 'failed',
        render_error: 'ffmpeg crashed',
      });
    });

    it('never overwrites a success, and ignores a repeated failure', async () => {
      const ready = fakeDataSource(
        runningJob({ status: 'ready', leaseExpiresAt: null }),
        montage({ render_status: 'ready', rendered_media_id: MASTER }),
      );
      await service(ready.dataSource).complete(JOB_ID, 'lease', result(false));
      expect(ready.state.edit.render_status).toBe('ready');

      const repeated = fakeDataSource(
        runningJob({ status: 'pending', leaseExpiresAt: null }),
        montage(),
      );
      await service(repeated.dataSource).complete(
        JOB_ID,
        'lease',
        result(false),
      );
      expect(repeated.dataSource.getRepository().save).not.toHaveBeenCalled();
    });

    it('refuses a replaced or expired lease', async () => {
      await expect(
        service(fakeDataSource(runningJob(), montage()).dataSource).complete(
          JOB_ID,
          'other-lease',
          result(true),
        ),
      ).rejects.toThrow(ConflictException);
      await expect(
        service(
          fakeDataSource(
            runningJob({ leaseExpiresAt: new Date(Date.now() - 1) }),
            montage(),
          ).dataSource,
        ).complete(JOB_ID, 'lease', result(true)),
      ).rejects.toThrow(ConflictException);
    });

    it('leaves a montage saved since alone', async () => {
      const edit = montage({ version: 3, render_status: 'pending' });
      const { dataSource, state } = fakeDataSource(runningJob(), edit);
      await service(dataSource).complete(JOB_ID, 'lease', result(true));
      expect(state.job.status).toBe('ready');
      expect(state.edit).toEqual(edit);
    });

    it('answers 400 to a result of another job', async () => {
      await expect(
        service(fakeDataSource(runningJob(), montage()).dataSource).complete(
          JOB_ID,
          'lease',
          { ...result(true), jobId: EDIT_ID },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('failStaleJobs', () => {
    const hours = (n: number) => n * 3600 * 1000;

    it('fails a job nothing ran for 3 leases, and its montage', async () => {
      const { dataSource, state } = fakeDataSource(
        pendingJob({
          payload: {
            ...pendingJob().payload,
            timestamp: Date.now() - hours(4),
          },
        }),
        montage(),
      );

      await service(dataSource).failStaleJobs();

      expect(state.job.status).toBe('failed');
      expect(state.edit).toMatchObject({
        render_status: 'failed',
        render_error: 'No render worker picked the job up any more',
      });
    });

    it('leaves a recent or running job alone', async () => {
      for (const job of [
        pendingJob({
          payload: {
            ...pendingJob().payload,
            timestamp: Date.now() - hours(2),
          },
        }),
        runningJob(),
      ]) {
        const { dataSource, state } = fakeDataSource(job, montage());
        await service(dataSource).failStaleJobs();
        expect(state.job.status).toBe(job.status);
      }
    });
  });

  describe('removeOrphanRenditions', () => {
    const day = 24 * 3600 * 1000;
    const finished = (status: 'ready' | 'failed', ageMs: number) =>
      pendingJob({
        status,
        result: {
          ...result(status === 'ready'),
          processedAt: Date.now() - ageMs,
        },
      });

    beforeEach(() => {
      s3.send.mockImplementation(async (command) =>
        command instanceof ListObjectsV2Command
          ? {
              Contents: [
                { Key: `${VIDEO_ID}/edits/${JOB_ID}/master.m3u8` },
                { Key: `${VIDEO_ID}/edits/${JOB_ID}/720p0.ts` },
              ],
            }
          : {},
      );
    });

    it.each([
      ['replaced or reverted', 'ready' as const],
      ['failed', 'failed' as const],
    ])('deletes the files of a %s render after 24 h', async (_, status) => {
      const { dataSource, state } = fakeDataSource(
        finished(status, day + 1000),
        montage({ rendered_media_id: null, render_status: 'draft' }),
      );

      await expect(service(dataSource).removeOrphanRenditions()).resolves.toBe(
        1,
      );

      const list = s3.send.mock.calls[0][0] as ListObjectsV2Command;
      expect(list.input.Prefix).toBe(`${VIDEO_ID}/edits/${JOB_ID}/`);
      const deletion = s3.send.mock.calls[1][0] as DeleteObjectsCommand;
      expect(deletion.input.Delete.Objects).toHaveLength(2);
      expect(state.job.files_deleted_at).toBeInstanceOf(Date);
    });

    it('keeps the rendition viewers get, and a recent one', async () => {
      for (const [job, edit] of [
        [finished('ready', 2 * day), montage({ rendered_media_id: MASTER })],
        [finished('ready', day - 60_000), montage()],
      ] as const) {
        const { dataSource } = fakeDataSource(job, edit);
        await expect(
          service(dataSource).removeOrphanRenditions(),
        ).resolves.toBe(0);
      }
      expect(s3.send).not.toHaveBeenCalled();
    });

    it('retries later when S3 fails', async () => {
      s3.send.mockRejectedValue(new Error('S3 down'));
      const { dataSource, state } = fakeDataSource(
        finished('failed', 2 * day),
        montage(),
      );
      await expect(service(dataSource).removeOrphanRenditions()).resolves.toBe(
        0,
      );
      expect(state.job.files_deleted_at).toBeNull();
    });
  });
});
