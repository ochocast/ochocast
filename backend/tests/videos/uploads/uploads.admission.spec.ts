import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UploadsService } from 'src/videos/uploads/uploads.service';
import {
  MultipartStorage,
  S3MultipartStorage,
} from 'src/videos/uploads/multipart-storage';
import { VideoUpload } from 'src/videos/uploads/upload.entity';
import { TranscodingJobsService } from 'src/transcoding-jobs/transcoding-jobs.service';

describe('Upload admission of the source file', () => {
  let db: { manager: { findOneBy: jest.Mock }; transaction: jest.Mock };
  const service = (enabled: boolean) =>
    new UploadsService(
      db as unknown as DataSource,
      {} as MultipartStorage,
      { enabled } as any,
      {} as TranscodingJobsService,
    );

  beforeEach(() => {
    db = {
      manager: { findOneBy: jest.fn().mockResolvedValue({ id: 'owner' }) },
      transaction: jest.fn().mockResolvedValue({ id: 'session' }),
    };
  });

  it.each([
    'notes.html',
    'image.svg',
    'playlist.m3u8',
    'segment.ts',
    'clip',
    'trick.constructor',
  ])(
    'refuses %s while transcoding is disabled because the source is served as is',
    async (filename) => {
      await expect(
        service(false).create('user@example.test', { size: 10, filename }),
      ).rejects.toThrow(new BadRequestException('Unsupported video format'));
      expect(db.transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['talk.mp4', 'Talk.MOV', 'talk.webm', 'talk.mkv', 'talk.avi'])(
    'admits the video %s while transcoding is disabled',
    async (filename) => {
      await service(false).create('user@example.test', { size: 10, filename });
      expect(db.transaction).toHaveBeenCalledTimes(1);
    },
  );

  it('leaves format checks to FFmpeg when transcoding is enabled', async () => {
    await service(true).create('user@example.test', {
      size: 10,
      filename: 'clip',
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});

describe('Multipart source content type', () => {
  it.each([
    ['Talk.MOV', 'video/quicktime'],
    ['talk.webm', 'video/webm'],
    ['notes.html', 'application/octet-stream'],
    ['trick.constructor', 'application/octet-stream'],
  ])('stores %s as %s', async (filename, type) => {
    const send = jest.fn().mockResolvedValue({ UploadId: 'upload' });
    await new S3MultipartStorage({ send } as any).create({
      id: 'session',
      key: 'session/source/original',
      filename,
      checksumMode: 'sha256',
    } as VideoUpload);
    expect(send.mock.calls[0][0].input.ContentType).toBe(type);
  });
});
