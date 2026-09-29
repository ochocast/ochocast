import { DataSource } from 'typeorm';
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'crypto';
import {
  UploadsService,
  validateParts,
} from 'src/videos/uploads/uploads.service';
import { S3MultipartStorage } from 'src/videos/uploads/multipart-storage';
import { VideoUpload } from 'src/videos/uploads/upload.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { VideoUploads1788950000000 } from 'src/migrations/1788950000000-VideoUploads';

const integration = process.env.UPLOAD_TEST_DATABASE_URL
  ? describe
  : describe.skip;
integration('multipart with real PostgreSQL and S3 (local only)', () => {
  let db: DataSource,
    storage: S3MultipartStorage,
    service: UploadsService,
    s3: S3Client;
  const owner = 'multipart-test@example.test';
  let other: UserEntity;
  const checksum = (b: Buffer) =>
    createHash('sha256').update(b).digest('base64');
  beforeAll(async () => {
    const url = process.env.UPLOAD_TEST_DATABASE_URL;
    if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname))
      throw new Error('Tests require a local database');
    process.env.STOCK_MEDIA_BUCKET = 'upload-test-media';
    process.env.STOCK_MINIATURE_BUCKET = 'upload-test-miniature';
    process.env.UPLOAD_CHECKSUM_MODE = 'sha256';
    db = new DataSource({
      type: 'postgres',
      url,
      entities: ['src/**/*.entity.ts'],
      synchronize: false,
    });
    await db.initialize();
    await db.dropDatabase(); // Dedicated disposable local database supplied explicitly by the test runner.
    const runner = db.createQueryRunner();
    await new VideoUploads1788950000000().up(runner);
    await db.synchronize();
    await runner.release();
    for (const email of [owner, 'other@example.test']) {
      other = await db.manager.save(
        UserEntity,
        new UserEntity({
          id: randomUUID(),
          email,
          firstName: 'Test',
          lastName: 'User',
          role: 'user',
          createdAt: new Date(),
        }),
      );
    }
    s3 = new S3Client({
      endpoint: process.env.UPLOAD_TEST_S3_URL || 'http://127.0.0.1:29000',
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: 'uploadtest', secretAccessKey: 'uploadtest' },
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
    for (const Bucket of [
      process.env.STOCK_MEDIA_BUCKET,
      process.env.STOCK_MINIATURE_BUCKET,
    ]) {
      await s3.send(new CreateBucketCommand({ Bucket })).catch((e) => {
        if (e.name !== 'BucketAlreadyOwnedByYou') throw e;
      });
    }
    storage = new S3MultipartStorage(s3);
    service = new UploadsService(db, storage);
  }, 30000);
  afterAll(async () => {
    s3?.destroy();
    if (db?.isInitialized) await db.destroy();
  });
  async function upload(size = 1024, filename = 'sample.mp4') {
    const session = await service.create(owner, { size, filename });
    const bytes = Buffer.alloc(size, 17);
    for (
      let start = 0, number = 1;
      start < size;
      start += session.partSize, number++
    ) {
      const part = bytes.subarray(
        start,
        Math.min(start + session.partSize, size),
      );
      const { url, headers } = await service.sign(
        session.id,
        owner,
        number,
        checksum(part),
      );
      const response = await fetch(url, { method: 'PUT', body: part, headers });
      if (!response.ok) throw new Error(await response.text());
      expect(response.status).toBe(200);
    }
    return session;
  }
  const metadata = {
    title: 'Video test',
    tags: '[]',
    internal_speakers: '[]',
    creator: 'forged-user',
  };
  it('resumes >16MiB with provider checksum verification, verifies ownership and finalizes exactly once', async () => {
    const session = await upload(17 * 1024 ** 2);
    const resumedService = new UploadsService(db, storage);
    const status = await resumedService.status(session.id, owner);
    expect(status.parts).toHaveLength(2);
    expect(status.parts[0].size).toBe(16 * 1024 ** 2);
    await expect(service.status(session.id, other.email)).rejects.toThrow();
    await expect(
      service.sign(session.id, other.email, 1, checksum(Buffer.from('x'))),
    ).rejects.toThrow();
    await expect(
      service.complete(session.id, other.email, metadata),
    ).rejects.toThrow();
    await expect(service.cancel(session.id, other.email)).rejects.toThrow();
    await expect(
      service.sign(session.id, owner, 1, checksum(Buffer.from('changed'))),
    ).rejects.toThrow('Different file');
    const results = await Promise.all([
      service.complete(session.id, owner, metadata),
      service.complete(session.id, owner, metadata),
    ]);
    expect(results).toEqual([{ id: session.id }, { id: session.id }]);
    const video = await db.manager.findOne(VideoEntity, {
      where: { id: session.id },
      relations: ['creator'],
    });
    expect(video.creator.email).toBe(owner);
    expect(video.transcoding_status).toBe('ready');
    expect(video.media_id).toMatch(/\/source\/original\.mp4$/);
  });
  it('rejects actual part size mismatch and missing parts', async () => {
    const session = await service.create(owner, {
      size: 3000,
      filename: 'short.mp4',
    });
    await expect(service.complete(session.id, owner, metadata)).rejects.toThrow(
      'Missing',
    );
    const body = Buffer.alloc(1000);
    const { url, headers } = await service.sign(
      session.id,
      owner,
      1,
      checksum(body),
    );
    expect((await fetch(url, { method: 'PUT', body, headers })).status).toBe(
      200,
    );
    await expect(service.complete(session.id, owner, metadata)).rejects.toThrow(
      'Invalid part',
    );
    await service.cancel(session.id, owner);
  });
  it('storage rejects a corrupted part with the signed checksum', async () => {
    const s = await service.create(owner, { size: 4, filename: 'bad.mp4' });
    const { url, headers } = await service.sign(
      s.id,
      owner,
      1,
      checksum(Buffer.from('good')),
    );
    expect(
      (await fetch(url, { method: 'PUT', body: Buffer.from('evil'), headers }))
        .status,
    ).toBe(400);
    await service.cancel(s.id, owner);
  });
  it('recovers after S3 complete succeeded but DB/HTTP completion was interrupted', async () => {
    const session = await upload();
    const s = await db.manager.findOneByOrFail(VideoUpload, { id: session.id });
    const parts = await storage.parts(s);
    validateParts(s, parts);
    await storage.complete(s, parts);
    expect((await service.status(s.id, owner)).state).toBe('uploaded');
    expect(await service.complete(s.id, owner, metadata)).toEqual({ id: s.id });
  });
  it('finalizes the source and metadata without a transcoding broker', async () => {
    const session = await upload();
    await expect(
      service.complete(session.id, owner, metadata),
    ).resolves.toEqual({ id: session.id });
    const stored = await db.manager.findOneByOrFail(VideoUpload, {
      id: session.id,
    });
    expect(stored.state).toBe('uploaded');
    expect((await storage.head(stored)).size).toBe(1024);
    const video = await db.manager.findOneByOrFail(VideoEntity, {
      id: session.id,
    });
    expect(video.transcoding_status).toBe('ready');
    expect(video.media_id).toMatch(/\/source\/original\.mp4$/);
  });
  it('cleans expired multipart uploads and makes cancellation idempotent', async () => {
    const s = await service.create(owner, {
      size: 10,
      filename: 'abandoned.mp4',
    });
    await db.manager.update(VideoUpload, s.id, { expiresAt: new Date(0) });
    await service.maintain();
    expect((await service.status(s.id, owner)).state).toBe('aborted');
    await service.cancel(s.id, owner);
    await expect(
      service.sign(s.id, owner, 1, checksum(Buffer.alloc(10))),
    ).rejects.toThrow();
  });
});
