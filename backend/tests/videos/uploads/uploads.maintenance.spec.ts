import { DataSource } from 'typeorm';
import { UploadsService } from 'src/videos/uploads/uploads.service';
import { MultipartStorage } from 'src/videos/uploads/multipart-storage';
import { VideoUpload } from 'src/videos/uploads/upload.entity';
import { TranscodingJobsService } from 'src/transcoding-jobs/transcoding-jobs.service';

describe('Upload maintenance with and without a transcoding queue', () => {
  let expired: VideoUpload[];
  let manager: { createQueryBuilder: jest.Mock; save: jest.Mock };
  let db: { transaction: jest.Mock; getRepository: jest.Mock };
  let storage: { abort: jest.Mock; remove: jest.Mock };
  const publishRegisteredJob = jest.fn();
  const chain = (rows: () => VideoUpload[]) => {
    const builder = {
      setLock: () => builder,
      setOnLocked: () => builder,
      innerJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
      take: () => builder,
      getMany: async () => rows(),
    };
    return builder;
  };
  const service = (enabled: boolean) =>
    new UploadsService(
      db as unknown as DataSource,
      storage as unknown as MultipartStorage,
      { enabled, publishRegisteredJob } as any,
      {} as TranscodingJobsService,
    );

  beforeEach(() => {
    publishRegisteredJob.mockReset();
    expired = [{ id: 'expired', state: 'uploading' } as VideoUpload];
    manager = {
      createQueryBuilder: jest.fn(() => chain(() => expired)),
      save: jest.fn(),
    };
    db = {
      transaction: jest.fn(async (work) => work(manager)),
      getRepository: jest.fn(() => ({
        createQueryBuilder: () => chain(() => []),
      })),
    };
    storage = { abort: jest.fn(), remove: jest.fn() };
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
});
