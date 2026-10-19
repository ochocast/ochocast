import { DataSource } from 'typeorm';
import {
  S3Client,
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import {
  BadRequestException,
  ConflictException,
  INestApplication,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import {
  TranscodingJobsController,
  TranscodingCallbackGuard,
} from 'src/transcoding-jobs/transcoding-jobs.controller';
import { QueueService } from 'src/queue/queue.service';
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'crypto';
import {
  UploadsService,
  validateParts,
} from 'src/videos/uploads/uploads.service';
import { S3MultipartStorage } from 'src/videos/uploads/multipart-storage';
import { VideoUpload } from 'src/videos/uploads/upload.entity';
import { VideoGateway } from 'src/videos/infra/gateways/video.gateway';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { TranscodingJobsService } from 'src/transcoding-jobs/transcoding-jobs.service';
import { TranscodingJobEntity } from 'src/transcoding-jobs/transcoding-job.entity';
import { VideoTranscodingJob } from 'src/queue/job.types';
import { VideoUploads1788950000000 } from 'src/migrations/1788950000000-VideoUploads';
import { GetMediaUsecase } from 'src/videos/domain/usecases/getMedia.usecase';
import sharp = require('sharp');

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
  let jobs: TranscodingJobsService;
  // Declare enabled explicitly: a mock without it takes the disabled path.
  const queue = { enabled: true, publishRegisteredJob: jest.fn() };
  const disabledQueue = { enabled: false, publishRegisteredJob: jest.fn() };
  const makeService = () => new UploadsService(db, storage, queue as any, jobs);
  const makeDisabledService = () =>
    new UploadsService(db, storage, disabledQueue as any, jobs);
  beforeEach(() => {
    disabledQueue.publishRegisteredJob.mockReset();
    queue.publishRegisteredJob
      .mockReset()
      .mockImplementation(async (job: VideoTranscodingJob) => {
        // Another connection must see both committed rows before any publication.
        expect(
          await db.manager.findOneBy(VideoEntity, { id: job.videoId }),
        ).not.toBeNull();
        expect(
          await db.manager.findOneBy(TranscodingJobEntity, { id: job.jobId }),
        ).not.toBeNull();
      });
  });
  const checksum = (b: Buffer) =>
    createHash('sha256').update(b).digest('base64');
  const png = () =>
    sharp({
      create: { width: 8, height: 8, channels: 3, background: '#00ccff' },
    })
      .png()
      .toBuffer();
  beforeAll(async () => {
    const url = process.env.UPLOAD_TEST_DATABASE_URL;
    for (const target of [
      url,
      process.env.UPLOAD_TEST_S3_URL || 'http://127.0.0.1:29000',
    ]) {
      if (!['localhost', '127.0.0.1'].includes(new URL(target).hostname))
        throw new Error('Tests require local database and storage');
    }
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
    jobs = new TranscodingJobsService(db);
    service = makeService();
  }, 30000);
  afterAll(async () => {
    s3?.destroy();
    if (db?.isInitialized) await db.destroy();
  });
  async function upload(
    size = 1024,
    filename = 'sample.mp4',
    uploads = service,
  ) {
    const session = await uploads.create(owner, { size, filename });
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
      const { url, headers } = await uploads.sign(
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
    const resumedService = makeService();
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
    expect(video.transcoding_status).toBe('pending');
    expect(video.media_id).toBe(`${session.id}/master.m3u8`);
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
    expect((await service.status(s.id, owner)).state).toBe('uploading');
    expect(await service.complete(s.id, owner, metadata)).toEqual({ id: s.id });
  });
  it('keeps a failed publication durable and retries the same job after restart', async () => {
    const session = await upload();
    queue.publishRegisteredJob.mockRejectedValue(
      new Error('queue unavailable'),
    );
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
    expect(video.transcoding_status).toBe('pending');
    expect(video.media_id).toBe(`${session.id}/master.m3u8`);
    const job = await db.manager.findOneByOrFail(TranscodingJobEntity, {
      id: session.id,
    });
    queue.publishRegisteredJob.mockClear().mockResolvedValue(undefined);
    await makeService().maintain();
    // The same job, dated at its publication.
    const { payload } = await db.manager.findOneByOrFail(TranscodingJobEntity, {
      id: job.id,
    });
    expect(payload).toEqual({ ...job.payload, timestamp: expect.any(Number) });
    expect(queue.publishRegisteredJob).toHaveBeenCalledWith(payload);
    expect((await service.status(session.id, owner)).state).toBe('queued');
    expect(await service.complete(session.id, owner, metadata)).toEqual({
      id: session.id,
    });
    expect(queue.publishRegisteredJob).toHaveBeenCalledTimes(1);
    const claim = await jobs.claim(job.id, session.id);
    if (claim.status !== 'claimed') throw new Error('Expected claim');
    const result = {
      jobId: job.id,
      videoId: session.id,
      success: true,
      duration: 3,
      processedAt: Date.now(),
    };
    await jobs.complete(job.id, claim.leaseToken, result);
    await jobs.complete(job.id, claim.leaseToken, result);
    expect(await jobs.claim(job.id, session.id)).toEqual({
      status: 'completed',
    });
    expect(
      (await db.manager.findOneByOrFail(VideoEntity, { id: session.id }))
        .transcoding_status,
    ).toBe('ready');
  });
  it('counts pending and processing jobs for the disabled-queue boot warning', async () => {
    const before = await jobs.unfinished();
    const session = await upload();
    queue.publishRegisteredJob.mockRejectedValue(new Error('queue down'));
    await service.complete(session.id, owner, metadata);
    const { payload } = await db.manager.findOneByOrFail(TranscodingJobEntity, {
      id: session.id,
    });
    const pending = await jobs.unfinished();
    expect(pending.count).toBe(before.count + 1);
    expect(pending.oldest.getTime()).toBeLessThanOrEqual(payload.timestamp);
    const claim = await jobs.claim(session.id, session.id);
    if (claim.status !== 'claimed') throw new Error('Expected claim');
    expect((await jobs.unfinished()).count).toBe(before.count + 1);
    await jobs.complete(session.id, claim.leaseToken, {
      jobId: session.id,
      videoId: session.id,
      success: true,
      duration: 1,
      processedAt: Date.now(),
    });
    expect((await jobs.unfinished()).count).toBe(before.count);
  });
  it('rolls back video and job together and recovers an already completed S3 source', async () => {
    const session = await upload();
    const register = jest
      .spyOn(jobs, 'register')
      .mockRejectedValueOnce(new Error('DB failure'));
    await expect(service.complete(session.id, owner, metadata)).rejects.toThrow(
      'DB failure',
    );
    expect(
      await db.manager.findOneBy(VideoEntity, { id: session.id }),
    ).toBeNull();
    expect(
      await db.manager.findOneBy(TranscodingJobEntity, { id: session.id }),
    ).toBeNull();
    expect(queue.publishRegisteredJob).not.toHaveBeenCalled();
    expect((await service.status(session.id, owner)).state).toBe('uploading');
    register.mockRestore();
    await expect(
      service.complete(session.id, owner, metadata),
    ).resolves.toEqual({ id: session.id });
    expect((await service.status(session.id, owner)).state).toBe('queued');
  });
  it('queues attachment sources with separate final output keys', async () => {
    const session = await upload();
    await service.complete(session.id, owner, metadata, [
      {
        fieldname: 'miniature',
        originalname: 'thumb.png',
        mimetype: 'image/png',
        buffer: Buffer.from('image'),
      },
      {
        fieldname: 'subtitle',
        originalname: 'captions.srt',
        mimetype: 'text/plain',
        buffer: Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHello'),
      },
    ] as Express.Multer.File[]);
    const { payload } = await db.manager.findOneByOrFail(TranscodingJobEntity, {
      id: session.id,
    });
    expect(payload.originalKey).toBe(`${session.id}/source/original.mp4`);
    expect(payload.miniatureSourceKey).toBe(
      `${session.id}/source/miniature-original`,
    );
    expect(payload.subtitleSourceKey).toBe(
      `${session.id}/source/subtitle-${session.id}.vtt`,
    );
    expect(payload.subtitle_id).toBe(`subtitle-${session.id}.vtt`);
  });
  it('rejects subtitles above the worker limit before completing S3 and accepts the normalized boundary', async () => {
    const session = await upload();
    const complete = jest.spyOn(storage, 'complete');
    const file = (bytes: Buffer) =>
      [
        {
          fieldname: 'subtitle',
          originalname: 'captions.vtt',
          mimetype: 'text/vtt',
          buffer: bytes,
        },
      ] as Express.Multer.File[];
    // WEBVTT prefix plus final newline count toward the worker download limit.
    await expect(
      service.complete(
        session.id,
        owner,
        metadata,
        file(Buffer.alloc(4 * 1024 ** 2, 'a')),
      ),
    ).rejects.toThrow('Subtitle exceeds 4 MiB');
    expect(complete).not.toHaveBeenCalled();
    expect((await service.status(session.id, owner)).state).toBe('uploading');
    const boundary = Buffer.from('WEBVTT\n\n' + 'a'.repeat(4 * 1024 ** 2 - 9));
    await expect(
      service.complete(session.id, owner, metadata, file(boundary)),
    ).resolves.toEqual({ id: session.id });
    const { payload } = await db.manager.findOneByOrFail(TranscodingJobEntity, {
      id: session.id,
    });
    expect(
      (
        await s3.send(
          new GetObjectCommand({
            Bucket: process.env.STOCK_MEDIA_BUCKET,
            Key: payload.subtitleSourceKey,
          }),
        )
      ).ContentLength,
    ).toBe(4 * 1024 ** 2);
    complete.mockRestore();
  });
  it('permanently deletes retained thumbnail sources, media and the job', async () => {
    const session = await upload();
    await service.complete(session.id, owner, metadata, [
      {
        fieldname: 'miniature',
        originalname: 'thumb.png',
        mimetype: 'image/png',
        buffer: Buffer.from('image'),
      },
    ] as Express.Multer.File[]);
    const job = await db.manager.findOneByOrFail(TranscodingJobEntity, {
      id: session.id,
    });
    const thumbnail = {
      Bucket: process.env.STOCK_MINIATURE_BUCKET,
      Key: job.payload.miniatureSourceKey,
    };
    expect((await s3.send(new GetObjectCommand(thumbnail))).ContentLength).toBe(
      5,
    );
    await new VideoGateway(db.getRepository(VideoEntity), s3).deleteVideoAdmin(
      session.id,
    );
    await expect(
      s3.send(new GetObjectCommand(thumbnail)),
    ).rejects.toMatchObject({ name: 'NoSuchKey' });
    await expect(
      s3.send(
        new GetObjectCommand({
          Bucket: process.env.STOCK_MEDIA_BUCKET,
          Key: job.payload.originalKey,
        }),
      ),
    ).rejects.toMatchObject({ name: 'NoSuchKey' });
    expect(
      await db.manager.findOneBy(TranscodingJobEntity, { id: session.id }),
    ).toBeNull();
  });
  it('rejects sources above the default 1 GiB worker limit at admission', async () => {
    delete process.env.UPLOAD_MAX_BYTES;
    await expect(
      service.create(owner, { size: 1024 ** 3 + 1, filename: 'big.mp4' }),
    ).rejects.toThrow('Invalid filename or upload size');
  });
  // CI enables this recipe after compiling the worker and starting a dedicated emulator.
  (process.env.UPLOAD_TEST_QUEUE_URL ? it : it.skip)(
    'runs multipart through the real queue, HTTP worker, authenticated callbacks and HLS output',
    async () => {
      const env = { ...process.env };
      const directory = await mkdtemp(join(tmpdir(), 'multipart-ffmpeg-'));
      let app: TestingModule;
      let backend: INestApplication;
      let worker: { server: Server; shutdown: AbortController };
      try {
        Object.assign(process.env, {
          NODE_ENV: 'development',
          TRANSCODING_QUEUE_PROVIDER: 'local',
          TRANSCODING_QUEUE_ENDPOINT: new URL(process.env.UPLOAD_TEST_QUEUE_URL)
            .origin,
          TRANSCODING_QUEUE_URL: process.env.UPLOAD_TEST_QUEUE_URL,
          TRANSCODING_QUEUE_REGION: 'fr-par',
          TRANSCODING_QUEUE_ACCESS_KEY: 'local',
          TRANSCODING_QUEUE_SECRET_KEY: 'local',
          TRANSCODING_DISPATCH_SECRET:
            'multipart-local-dispatch-secret-32-characters',
          TRANSCODING_CALLBACK_SECRET:
            'multipart-local-callback-secret-32-characters',
          TRANSCODING_MAX_SOURCE_BYTES: String(1024 ** 3),
        });
        app = await Test.createTestingModule({
          controllers: [TranscodingJobsController],
          providers: [
            TranscodingCallbackGuard,
            { provide: TranscodingJobsService, useValue: jobs },
          ],
        }).compile();
        backend = app.createNestApplication();
        backend.setGlobalPrefix('api');
        await backend.listen(0, '127.0.0.1');
        // Compiled worker code uses the real processor/FFmpeg; no S3 or callback mocks.
        const workerRoot = resolve('../ffmpegServer/dist');
        const { BackendClient } = require(
          join(workerRoot, 'serverless/backend-client'),
        );
        const { JobRunner } = require(
          join(workerRoot, 'serverless/job-runner'),
        );
        const { JobProcessorService } = require(
          join(workerRoot, 'services/job-processor.service'),
        );
        const { createWorkerServer } = require(join(workerRoot, 'http-worker'));
        worker = createWorkerServer(
          new JobRunner(
            new BackendClient(
              `${await backend.getUrl()}/api`,
              process.env.TRANSCODING_CALLBACK_SECRET,
            ),
            new JobProcessorService(s3),
            30000,
          ),
          process.env.TRANSCODING_DISPATCH_SECRET,
        );
        await new Promise<void>((done) =>
          worker.server.listen(0, '127.0.0.1', done),
        );
        const workerUrl = `http://127.0.0.1:${(worker.server.address() as import('node:net').AddressInfo).port}/`;
        process.env.LOCAL_QUEUE_BRIDGE_WORKER_URL = workerUrl;
        const realQueue = new QueueService(jobs);
        const uploads = new UploadsService(db, storage, realQueue, jobs);
        const input = join(directory, 'sample.mp4');
        execFileSync('ffmpeg', [
          '-hide_banner',
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=1280x720:rate=25',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=1000:sample_rate=48000',
          '-t',
          '2',
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-y',
          input,
        ]);
        const bytes = await readFile(input);
        const session = await uploads.create(owner, {
          size: bytes.length,
          filename: 'sample.mp4',
        });
        const { url, headers } = await uploads.sign(
          session.id,
          owner,
          1,
          checksum(bytes),
        );
        expect(
          (await fetch(url, { method: 'PUT', body: bytes, headers })).status,
        ).toBe(200);
        const image = await png();
        await uploads.complete(session.id, owner, metadata, [
          {
            fieldname: 'miniature',
            originalname: 'thumbnail.png',
            mimetype: 'image/png',
            buffer: image,
          },
          {
            fieldname: 'subtitle',
            originalname: 'subtitle.srt',
            mimetype: 'text/plain',
            buffer: Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHello'),
          },
        ] as Express.Multer.File[]);
        const endpoint = `${await backend.getUrl()}/api/internal/transcoding/jobs/${session.id}/claim`;
        expect(
          (
            await fetch(endpoint, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ videoId: session.id }),
            })
          ).status,
        ).toBe(401);
        const deadline = Date.now() + 30000;
        let video: VideoEntity;
        do {
          video = await db.manager.findOneByOrFail(VideoEntity, {
            id: session.id,
          });
          if (video.transcoding_status !== 'pending') break;
          await new Promise((done) => setTimeout(done, 50));
        } while (Date.now() < deadline);
        expect(video.transcoding_status).toBe('ready');
        const get = async (
          key: string,
          bucket = process.env.STOCK_MEDIA_BUCKET,
        ) => s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        const master = await (
          await get(video.media_id)
        ).Body.transformToString();
        for (const height of [360, 480, 720]) {
          expect(master).toMatch(new RegExp(`RESOLUTION=\\d+x${height}`));
        }
        const objects = await s3.send(
          new ListObjectsV2Command({
            Bucket: process.env.STOCK_MEDIA_BUCKET,
            Prefix: `${session.id}/`,
          }),
        );
        expect(
          objects.Contents.filter((o) => o.Key.endsWith('.m3u8')),
        ).toHaveLength(4);
        expect(
          objects.Contents.filter((o) => o.Key.endsWith('.ts')).length,
        ).toBeGreaterThanOrEqual(3);
        expect((await get(`${session.id}/audio.flac`)).ContentType).toBe(
          'audio/flac',
        );
        expect((await get(video.subtitle_id)).ContentType).toBe('text/vtt');
        expect(
          (await get(video.miniature_id, process.env.STOCK_MINIATURE_BUCKET))
            .ContentType,
        ).toBe('image/jpeg');
        expect(
          (await get(`${session.id}/source/original.mp4`)).ContentLength,
        ).toBe(bytes.length);
        const job = await db.manager.findOneByOrFail(TranscodingJobEntity, {
          id: session.id,
        });
        // Replay a signed delivery: completed claim acknowledges it without re-encoding.
        const envelope = {
          job: job.payload,
          signature: createHmac(
            'sha256',
            process.env.TRANSCODING_DISPATCH_SECRET,
          )
            .update(JSON.stringify(job.payload))
            .digest('hex'),
        };
        // Drain the development bridge before closing the HTTP servers.
        await realQueue['localBridgeTail'];
        expect(
          (
            await fetch(workerUrl, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(envelope),
            })
          ).status,
        ).toBe(200);
        expect(
          (
            await db.manager.findOneByOrFail(TranscodingJobEntity, {
              id: session.id,
            })
          ).attempts,
        ).toBe(1);
      } finally {
        process.env = env;
        if (worker)
          await new Promise<void>((done, reject) =>
            worker.server.close((error) => (error ? reject(error) : done())),
          );
        await backend?.close();
        await app?.close();
        await rm(directory, { recursive: true, force: true });
      }
    },
    60000,
  );
  const attachments = async () =>
    [
      {
        fieldname: 'miniature',
        originalname: 'thumb.png',
        mimetype: 'image/png',
        buffer: await png(),
      },
      {
        fieldname: 'subtitle',
        originalname: 'captions.srt',
        mimetype: 'text/plain',
        buffer: Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHello'),
      },
    ] as Express.Multer.File[];
  const exists = (Bucket: string, Key: string) =>
    s3.send(new GetObjectCommand({ Bucket, Key })).then(
      () => true,
      (e) => {
        if (e.name !== 'NoSuchKey') throw e;
        return false;
      },
    );
  it('plays a completed upload from its source without a job when transcoding is disabled', async () => {
    const disabled = makeDisabledService();
    const session = await upload(1024, 'sample.mp4', disabled);
    await expect(
      disabled.complete(session.id, owner, metadata, await attachments()),
    ).resolves.toEqual({ id: session.id });
    const video = await db.manager.findOneByOrFail(VideoEntity, {
      id: session.id,
    });
    expect(video.transcoding_status).toBe('ready');
    expect(video.media_id).toBe(`${session.id}/source/original.mp4`);
    expect(video.miniature_id).toBe(`miniature-${session.id}.jpg`);
    expect(video.subtitle_id).toBe(`subtitle-${session.id}.vtt`);
    const subtitle = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: video.subtitle_id,
      }),
    );
    expect(subtitle.ContentType).toBe('text/vtt');
    expect(await subtitle.Body.transformToString()).toBe(
      'WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHello\n',
    );
    // Served as is, so only the worker's rendition: a 1280x720 JPEG.
    const miniature = await s3.send(
      new GetObjectCommand({
        Bucket: process.env.STOCK_MINIATURE_BUCKET,
        Key: video.miniature_id,
      }),
    );
    expect(miniature.ContentType).toBe('image/jpeg');
    expect(
      await sharp(
        Buffer.from(await miniature.Body.transformToByteArray()),
      ).metadata(),
    ).toMatchObject({ format: 'jpeg', width: 1280, height: 720 });
    expect(
      await exists(
        process.env.STOCK_MINIATURE_BUCKET,
        `${session.id}/source/miniature-original`,
      ),
    ).toBe(false);
    expect(
      await exists(
        process.env.STOCK_MEDIA_BUCKET,
        `${session.id}/source/${video.subtitle_id}`,
      ),
    ).toBe(false);
    expect(
      await db.manager.findOneBy(TranscodingJobEntity, { id: session.id }),
    ).toBeNull();
    expect((await disabled.status(session.id, owner)).state).toBe('uploaded');
    // The browser plays the presigned source immediately.
    const url = await new GetMediaUsecase(
      new VideoGateway(db.getRepository(VideoEntity), s3),
      s3,
    ).execute(session.id, 'http://api.test/api');
    const media = await fetch(url);
    expect(media.status).toBe(200);
    expect(media.headers.get('content-type')).toBe('video/mp4');
    expect((await media.arrayBuffer()).byteLength).toBe(1024);
    // Retries, cancellation and maintenance leave the finalized upload alone.
    await expect(
      disabled.complete(session.id, owner, metadata),
    ).resolves.toEqual({ id: session.id });
    await expect(disabled.cancel(session.id, owner)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await disabled.maintain();
    expect((await disabled.status(session.id, owner)).state).toBe('uploaded');
    expect(
      (await db.manager.findOneByOrFail(VideoEntity, { id: session.id }))
        .transcoding_status,
    ).toBe('ready');
    expect(disabledQueue.publishRegisteredJob).not.toHaveBeenCalled();
    // Permanent deletion removes the source and the final attachments.
    await new VideoGateway(db.getRepository(VideoEntity), s3).deleteVideoAdmin(
      session.id,
    );
    for (const [bucket, key] of [
      [process.env.STOCK_MEDIA_BUCKET, video.media_id],
      [process.env.STOCK_MEDIA_BUCKET, video.subtitle_id],
      [process.env.STOCK_MINIATURE_BUCKET, video.miniature_id],
    ])
      expect(await exists(bucket, key)).toBe(false);
  });
  it('never publishes client markup as the miniature while transcoding is disabled', async () => {
    const disabled = makeDisabledService();
    const session = await upload(1024, 'sample.mp4', disabled);
    await expect(
      disabled.complete(session.id, owner, metadata, [
        {
          fieldname: 'miniature',
          originalname: 'thumb.jpg',
          mimetype: 'text/html',
          buffer: Buffer.from('<script>alert(document.domain)</script>'),
        },
      ] as Express.Multer.File[]),
    ).resolves.toEqual({ id: session.id });
    const video = await db.manager.findOneByOrFail(VideoEntity, {
      id: session.id,
    });
    expect(video.transcoding_status).toBe('ready');
    // Not an image: no miniature, as for an upload without one.
    expect(
      await exists(process.env.STOCK_MINIATURE_BUCKET, video.miniature_id),
    ).toBe(false);
  });
  it('refuses to publish a non-video session opened while transcoding was enabled', async () => {
    const session = await upload(1024, 'clip');
    const s = await db.manager.findOneByOrFail(VideoUpload, { id: session.id });
    expect(s.key).toBe(`${session.id}/source/original.video`);
    const disabled = makeDisabledService();
    await expect(
      disabled.complete(session.id, owner, metadata),
    ).rejects.toThrow(new BadRequestException('Unsupported video format'));
    expect(
      await db.manager.findOneBy(VideoEntity, { id: session.id }),
    ).toBeNull();
    // Still open: the owner can cancel it, or maintenance expires it.
    expect((await disabled.status(session.id, owner)).state).toBe('uploading');
    await disabled.cancel(session.id, owner);
    expect((await disabled.status(session.id, owner)).state).toBe('aborted');
  });
  it('never transcodes uploads finalized while disabled once transcoding is enabled', async () => {
    const disabled = makeDisabledService();
    const session = await upload(1024, 'sample.mp4', disabled);
    await disabled.complete(session.id, owner, metadata);
    const enabled = makeService();
    await enabled.maintain();
    await expect(
      enabled.complete(session.id, owner, metadata),
    ).resolves.toEqual({ id: session.id });
    expect(queue.publishRegisteredJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ videoId: session.id }),
    );
    expect((await enabled.status(session.id, owner)).state).toBe('uploaded');
    const video = await db.manager.findOneByOrFail(VideoEntity, {
      id: session.id,
    });
    expect(video.transcoding_status).toBe('ready');
    expect(video.media_id).toBe(`${session.id}/source/original.mp4`);
  });
  it('leaves jobs registered while enabled untouched after switching to disabled', async () => {
    const session = await upload();
    queue.publishRegisteredJob.mockRejectedValue(new Error('queue down'));
    await service.complete(session.id, owner, metadata);
    const disabled = makeDisabledService();
    await expect(
      disabled.complete(session.id, owner, metadata),
    ).resolves.toEqual({ id: session.id });
    await disabled.maintain();
    expect(disabledQueue.publishRegisteredJob).not.toHaveBeenCalled();
    expect((await disabled.status(session.id, owner)).state).toBe('uploaded');
    expect(
      (
        await db.manager.findOneByOrFail(TranscodingJobEntity, {
          id: session.id,
        })
      ).status,
    ).toBe('pending');
    expect((await jobs.unfinished()).count).toBeGreaterThanOrEqual(1);
  });
  it('still aborts expired sessions while transcoding is disabled', async () => {
    const disabled = makeDisabledService();
    const s = await disabled.create(owner, {
      size: 10,
      filename: 'abandoned.mp4',
    });
    await db.manager.update(VideoUpload, s.id, { expiresAt: new Date(0) });
    await disabled.maintain();
    expect((await disabled.status(s.id, owner)).state).toBe('aborted');
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
  describe('reconciliation of lost or dead-lettered transcoding jobs', () => {
    const lostFor = 3 * 3600_000; // Beyond the default 2 h re-dispatch delay.
    // Rows as complete() or a recording leaves them, written directly. Jobs
    // are asserted by id: earlier tests share the database.
    async function staleJob(
      uploadState: 'uploaded' | 'queued' | null,
      fields: Partial<TranscodingJobEntity> = {},
      age = lostFor,
    ) {
      const id = randomUUID();
      await db.manager.insert(VideoEntity, {
        id,
        media_id: `${id}/master.m3u8`,
        miniature_id: `miniature-${id}.jpg`,
        title: 'Lost job',
        description: '',
        external_speakers: '',
        views: 0,
        archived: false,
        transcoding_status: 'pending',
        creator: { id: other.id },
      });
      const payload: VideoTranscodingJob = {
        jobId: id,
        videoId: id,
        originalFileName: 'sample.mp4',
        originalKey: `${id}/source/original.mp4`,
        media_id: `${id}/master.m3u8`,
        miniature_id: `miniature-${id}.jpg`,
        title: 'Lost job',
        timestamp: Date.now() - age,
      };
      await jobs.register(payload);
      if (Object.keys(fields).length)
        await db.manager.update(TranscodingJobEntity, id, fields);
      if (uploadState)
        await db.manager.insert(VideoUpload, {
          id,
          ownerId: other.id,
          key: payload.originalKey,
          size: '1',
          partSize: 1,
          filename: 'sample.mp4',
          checksumMode: 'sha256',
          state: uploadState,
          checksums: {},
          expiresAt: new Date(Date.now() + 3600_000),
          completedAt: new Date(Date.now() - age),
        });
      return payload;
    }
    const jobRow = (id: string) =>
      db.manager.findOneByOrFail(TranscodingJobEntity, { id });
    const published = (id: string) =>
      queue.publishRegisteredJob.mock.calls.filter(([job]) => job.jobId === id);

    it('republishes a lost pending job, with or without an upload row', async () => {
      const queued = await staleJob('queued');
      const recording = await staleJob(null);
      const fresh = await staleJob('queued', {}, 60_000);
      const before = Date.now();
      await service.maintain();
      for (const lost of [queued, recording]) {
        const row = await jobRow(lost.jobId);
        expect(row.status).toBe('pending');
        expect(row.payload.timestamp).toBeGreaterThanOrEqual(before);
        expect(published(lost.jobId)).toEqual([[row.payload]]);
      }
      expect(published(fresh.jobId)).toEqual([]);
    });

    it('republishes a processing job whose worker died, keeping its attempts', async () => {
      const crashed = await staleJob('queued', {
        status: 'processing',
        attempts: 2,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() - 11 * 60_000),
      });
      const running = await staleJob('queued', {
        status: 'processing',
        attempts: 1,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() - 60_000), // Within the grace period.
      });
      await service.maintain();
      const row = await jobRow(crashed.jobId);
      expect(row).toMatchObject({
        status: 'pending',
        attempts: 2,
        leaseToken: null,
        leaseExpiresAt: null,
      });
      expect(published(crashed.jobId)).toEqual([[row.payload]]);
      expect(published(running.jobId)).toEqual([]);
      expect((await jobRow(running.jobId)).status).toBe('processing');
      const claim = await jobs.claim(crashed.jobId, crashed.videoId);
      expect(claim.status).toBe('claimed');
      expect((await jobRow(crashed.jobId)).attempts).toBe(3);
    });

    it('marks the job and its video failed once attempts are exhausted', async () => {
      const doomed = await staleJob('queued', {
        status: 'processing',
        attempts: 10,
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() - 11 * 60_000),
      });
      await service.maintain();
      const error = 'Transcoding abandoned after 10 attempts';
      const row = await jobRow(doomed.jobId);
      expect(row.status).toBe('failed');
      expect(row.result).toMatchObject({
        success: false,
        error,
        permanent: true,
        reason: 'max_attempts',
      });
      expect(published(doomed.jobId)).toEqual([]);
      expect(
        await db.manager.findOneByOrFail(VideoEntity, { id: doomed.videoId }),
      ).toMatchObject({
        transcoding_status: 'failed',
        transcoding_error: 'max_attempts',
      });
      // Final: later sweeps leave it alone.
      await service.maintain();
      expect((await jobRow(doomed.jobId)).status).toBe('failed');
      expect(published(doomed.jobId)).toEqual([]);
    });

    it('republishes a failure marked retryable whose redeliveries ran out, never a final one', async () => {
      const failure = (
        id: string,
        fields: Record<string, unknown>,
        failedFor: number,
      ) => ({
        jobId: id,
        videoId: id,
        success: false,
        duration: 0,
        error: 'worker error',
        processedAt: Date.now() - failedFor,
        ...fields,
      });
      // Published lostFor ago (the message may be dead-lettered by now), and
      // failed failedFor ago.
      const failedJob = async (
        fields: Record<string, unknown>,
        failedFor = lostFor,
      ) => {
        const job = await staleJob('queued', { status: 'failed', attempts: 1 });
        await db.manager.update(TranscodingJobEntity, job.jobId, {
          result: failure(job.jobId, fields, failedFor),
        });
        return job;
      };
      const videoOf = (job: VideoTranscodingJob) =>
        db.manager.findOneByOrFail(VideoEntity, { id: job.videoId });
      const retryable = await failedJob({ retryable: true });
      const permanent = await failedJob({
        permanent: true,
        reason: 'invalid_source',
      });
      // As main left any failure, an invalid source among them: no marker.
      const legacy = await failedJob({});
      await db.manager.update(VideoEntity, legacy.videoId, {
        transcoding_status: 'failed',
        transcoding_error: 'ffmpeg exited with code 1',
      });
      const recent = await failedJob({ retryable: true }, 60_000);
      await service.maintain();
      const row = await jobRow(retryable.jobId);
      expect(row).toMatchObject({ status: 'pending', attempts: 1 });
      expect(published(retryable.jobId)).toEqual([[row.payload]]);
      expect(await videoOf(retryable)).toMatchObject({
        transcoding_status: 'pending',
        transcoding_error: null,
      });
      for (const final of [permanent, legacy]) {
        expect(published(final.jobId)).toEqual([]);
        expect((await jobRow(final.jobId)).status).toBe('failed');
      }
      expect(await videoOf(legacy)).toMatchObject({
        transcoding_status: 'failed',
      });
      // Published long ago but failed a minute ago: its message may still be
      // redelivered, so the delay counts from the failure, not the publication.
      expect(published(recent.jobId)).toEqual([]);
      expect((await jobRow(recent.jobId)).status).toBe('failed');
    });

    it('restores the video of a recording failed by an older backend when its job is republished', async () => {
      // Its first publication failed after registration: the job is pending.
      const recording = await staleJob(null);
      await db.manager.update(VideoEntity, recording.videoId, {
        transcoding_status: 'failed',
        transcoding_error: 'getaddrinfo ENOTFOUND queue',
      });
      await service.maintain();
      expect(published(recording.jobId)).toHaveLength(1);
      expect(
        await db.manager.findOneByOrFail(VideoEntity, {
          id: recording.videoId,
        }),
      ).toMatchObject({
        transcoding_status: 'pending',
        transcoding_error: null,
      });
    });

    it('leaves uploads still waiting for their first publication to re-dispatch', async () => {
      const waiting = await staleJob('uploaded');
      const before = Date.now();
      await service.maintain();
      // Published once, by re-dispatch, which dates the publication so the
      // next sweep does not take it for a lost message.
      const row = await jobRow(waiting.jobId);
      expect(row.payload.timestamp).toBeGreaterThanOrEqual(before);
      expect(published(waiting.jobId)).toEqual([[row.payload]]);
      expect(
        (await db.manager.findOneByOrFail(VideoUpload, { id: waiting.jobId }))
          .state,
      ).toBe('queued');
      await service.maintain();
      expect(published(waiting.jobId)).toHaveLength(1);
    });

    it('leaves a republication the queue refused untouched and retries it', async () => {
      const lost = await staleJob('queued');
      queue.publishRegisteredJob.mockRejectedValue(new Error('queue down'));
      await service.maintain();
      expect((await jobRow(lost.jobId)).payload).toEqual(lost);
      queue.publishRegisteredJob.mockReset().mockResolvedValue(undefined);
      await service.maintain();
      expect(published(lost.jobId)).toHaveLength(1);
      expect((await jobRow(lost.jobId)).payload.timestamp).toBeGreaterThan(
        lost.timestamp,
      );
    });

    it('never sweeps jobs while transcoding is disabled', async () => {
      const lost = await staleJob('queued');
      await makeDisabledService().maintain();
      expect(disabledQueue.publishRegisteredJob).not.toHaveBeenCalled();
      expect(await jobRow(lost.jobId)).toMatchObject({
        status: 'pending',
        payload: lost,
      });
      // Not left as a candidate for later enabled sweeps.
      await db.manager.delete(VideoUpload, lost.jobId);
      await db.manager.delete(VideoEntity, lost.videoId);
    });
  });
});
