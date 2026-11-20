import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { QueueService } from 'src/queue/queue.service';
import { TranscodingJobsService } from 'src/transcoding-jobs/transcoding-jobs.service';
import { TranscriptIndexer } from 'src/search/infra/transcript-indexer';
import { VideoGateway } from '../infra/gateways/video.gateway';
import { MultipartStorage } from './multipart-storage';
import { VideoUpload } from './upload.entity';
import { UploadsService } from './uploads.service';

describe('UploadsService.complete indexing', () => {
  const id = randomUUID();
  const email = 'owner@example.com';
  const subtitle = {
    fieldname: 'subtitle',
    originalname: 'cours.vtt',
    buffer: Buffer.from('WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nBonjour\n'),
  } as Express.Multer.File;
  let session: VideoUpload;
  let indexVideo: jest.Mock;
  let createNewVideo: jest.SpyInstance;
  let events: string[];

  // `queueEnabled` mirrors QueueService.enabled; the transaction callback runs
  // against a stub manager, and `events` records when it ends.
  const build = (queueEnabled: boolean) => {
    const manager = {
      findOneBy: jest.fn(async () => ({ id: session.ownerId })),
      findOne: jest.fn(async () => session),
      getRepository: jest.fn(),
      save: jest.fn(),
    };
    const db = {
      transaction: async (callback) => {
        const value = await callback(manager);
        events.push('commit');
        return value;
      },
    } as unknown as DataSource;
    const storage = {
      parts: jest.fn(async () => {
        throw Object.assign(new Error('gone'), { name: 'NoSuchUpload' });
      }),
      head: jest.fn(async () => ({ size: 10, session: id })),
      put: jest.fn(),
    } as unknown as MultipartStorage;
    const jobs = { register: jest.fn() } as unknown as TranscodingJobsService;
    const service = new UploadsService(
      db,
      storage,
      { enabled: queueEnabled } as unknown as QueueService,
      jobs,
      { indexVideo } as unknown as TranscriptIndexer,
    );
    jest
      .spyOn(service as any, 'dispatch')
      .mockImplementation(async () => undefined);
    return service;
  };
  const fields = { title: 'Cours' };

  beforeEach(() => {
    events = [];
    session = Object.assign(new VideoUpload(), {
      id,
      ownerId: randomUUID(),
      key: `${id}/source/original.mp4`,
      size: '10',
      partSize: 16 * 1024 ** 2,
      filename: 'original.mp4',
      checksumMode: 'sha256',
      state: 'uploading',
      checksums: {},
      expiresAt: new Date(Date.now() + 60_000),
    });
    indexVideo = jest.fn(async () => {
      events.push('index');
      return 'indexed';
    });
    createNewVideo = jest
      .spyOn(VideoGateway.prototype, 'createNewVideo')
      .mockResolvedValue(undefined as never);
  });
  afterEach(() => createNewVideo.mockRestore());

  it('indexes after an upload whose subtitle is final', async () => {
    await expect(
      build(false).complete(id, email, fields, [subtitle]),
    ).resolves.toEqual({ id });
    expect(indexVideo).toHaveBeenCalledTimes(1);
    expect(indexVideo).toHaveBeenCalledWith(id);
    // Never inside the transaction that writes subtitle_id.
    expect(events).toEqual(['commit', 'index']);
  });

  it('does not index an upload still transcoding', async () => {
    await build(true).complete(id, email, fields, [subtitle]);
    expect(indexVideo).not.toHaveBeenCalled();
  });

  it('does not index an upload without subtitle', async () => {
    await build(false).complete(id, email, fields, []);
    expect(indexVideo).not.toHaveBeenCalled();
  });

  it('does not index again when the upload was already completed', async () => {
    session.state = 'uploaded';
    await expect(
      build(false).complete(id, email, fields, [subtitle]),
    ).resolves.toEqual({ id });
    expect(indexVideo).not.toHaveBeenCalled();
  });

  it('an indexing failure does not fail the upload', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    try {
      indexVideo.mockRejectedValue(new Error('index down'));
      await expect(
        build(false).complete(id, email, fields, [subtitle]),
      ).resolves.toEqual({ id });
      await new Promise((resolve) => setImmediate(resolve));
      expect(error).toHaveBeenCalledWith(expect.stringContaining(id));
      expect(error).toHaveBeenCalledWith(expect.stringContaining('index down'));
    } finally {
      error.mockRestore();
    }
  });
});
