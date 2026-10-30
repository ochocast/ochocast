import { DataSource } from 'typeorm';
import { UploadsService } from 'src/videos/uploads/uploads.service';
import { MultipartStorage } from 'src/videos/uploads/multipart-storage';
import { VideoUpload } from 'src/videos/uploads/upload.entity';
import { TranscodingJobsService } from 'src/transcoding-jobs/transcoding-jobs.service';

const MiB = 1024 ** 2;

/** In-memory stand-in for the transactions of UploadsService. */
function fakeDatabase() {
  const sessions = new Map<string, VideoUpload>();
  const manager = {
    findOneBy: jest.fn(async () => ({ id: 'owner' })),
    findOne: jest.fn(async (_entity: unknown, options: any) =>
      options.where?.id && sessions.has(options.where.id)
        ? sessions.get(options.where.id)
        : { id: 'owner' },
    ),
    countBy: jest.fn(async () => 0),
    create: jest.fn((_entity: unknown, fields: VideoUpload) => ({ ...fields })),
    save: jest.fn(async (s: VideoUpload) => {
      sessions.set(s.id, s);
      return s;
    }),
  };
  const db = {
    manager,
    transaction: jest.fn(async (work: (m: typeof manager) => unknown) =>
      work(manager),
    ),
  };
  return { db: db as unknown as DataSource, sessions };
}

describe('Upload copied server side from a stored recording', () => {
  const size = 1300 * MiB;
  let storage: jest.Mocked<MultipartStorage>;

  beforeEach(() => {
    storage = {
      create: jest.fn().mockResolvedValue('multipart-id'),
      size: jest.fn().mockResolvedValue(size),
      copyPart: jest
        .fn()
        .mockImplementation(async (_s, part) => `"etag-${part}"`),
      abort: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<MultipartStorage>;
  });

  const service = (db: DataSource) =>
    new UploadsService(
      db,
      storage,
      { enabled: true } as any,
      {} as TranscodingJobsService,
    );

  it('copies the whole file in large parts and records their ETags', async () => {
    const { db, sessions } = fakeDatabase();

    const view = await service(db).createFromStoredMedia('orga@example.test', {
      key: 'recordings/t/merged/m.mp4',
      filename: 'recording.mp4',
    });
    // Answered before the copy: the browser follows it through `status`.
    expect(view.state).toBe('uploading');
    expect(sessions.get(view.id).checksums).toEqual({});
    await view.copied;

    // 512 MiB parts: two full parts and the remaining 276 MiB.
    expect(storage.copyPart.mock.calls.map((c) => c.slice(1))).toEqual(
      expect.arrayContaining([
        [1, 'recordings/t/merged/m.mp4', 0, 512 * MiB - 1],
        [2, 'recordings/t/merged/m.mp4', 512 * MiB, 1024 * MiB - 1],
        [3, 'recordings/t/merged/m.mp4', 1024 * MiB, size - 1],
      ]),
    );
    expect(storage.copyPart).toHaveBeenCalledTimes(3);
    const session = sessions.get(view.id);
    expect(session.checksumMode).toBe('etag');
    expect(session.key).toBe(`${view.id}/source/original.mp4`);
    expect(session.checksums).toEqual({
      1: '"etag-1"',
      2: '"etag-2"',
      3: '"etag-3"',
    });
  });

  it('is not limited by the browser upload cap', async () => {
    process.env.UPLOAD_MAX_BYTES = String(MiB);
    try {
      const { db } = fakeDatabase();
      await expect(
        service(db).createFromStoredMedia('orga@example.test', {
          key: 'recordings/t/s/original.mp4',
          filename: 'recording.mp4',
        }),
      ).resolves.toMatchObject({ size });
    } finally {
      delete process.env.UPLOAD_MAX_BYTES;
    }
  });

  it('aborts the session when a copy fails, so the browser stops waiting', async () => {
    const { db, sessions } = fakeDatabase();
    storage.copyPart.mockRejectedValueOnce(new Error('copy failed'));

    const view = await service(db).createFromStoredMedia('orga@example.test', {
      key: 'recordings/t/s/original.mp4',
      filename: 'recording.mp4',
    });
    await view.copied;

    expect(storage.abort).toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalled();
    expect([...sessions.values()][0].state).toBe('aborted');
  });
});
