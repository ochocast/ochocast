import { Test, TestingModule } from '@nestjs/testing';
import { Upload } from '@aws-sdk/lib-storage';
import { mock } from 'jest-mock-extended';
import { CreateNewVideoUsecase } from 'src/videos/domain/usecases/createNewVideo.usecase';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { CreateVideoDto } from 'src/videos/infra/controllers/dto/create-video.dto';
import { VideoObject } from 'src/videos/domain/video';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { QueueService } from 'src/queue/queue.service';
import { S3Client } from '@aws-sdk/client-s3';
import { BadRequestException } from '@nestjs/common';
import sharp = require('sharp');

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({
    done: jest.fn().mockResolvedValue({}),
  })),
}));

describe('CreateNewVideoUsecase - asynchronous transcoding', () => {
  let usecase: CreateNewVideoUsecase;
  let videoGateway: jest.Mocked<IVideoGateway>;
  let queueService: Pick<QueueService, 'enabled'> &
    jest.Mocked<Pick<QueueService, 'publishJob'>>;
  const build = async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateNewVideoUsecase,
        { provide: 'VideoGateway', useValue: videoGateway },
        { provide: 's3Client', useValue: mock<S3Client>() },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();
    return module.get(CreateNewVideoUsecase);
  };

  beforeEach(async () => {
    (Upload as unknown as jest.Mock).mockClear();
    videoGateway = mock<IVideoGateway>();
    // Declare enabled explicitly: a mock without it takes the disabled path.
    queueService = {
      enabled: true,
      publishJob: jest.fn().mockResolvedValue(undefined),
    };
    videoGateway.createNewVideo.mockImplementation(async (video) => video);
    usecase = await build();
  });

  const dto: CreateVideoDto = {
    title: 'Test Video',
    description: 'Asynchronous transcoding',
    tags: [new TagEntity({ name: 'test' })],
    creator: new UserEntity({ id: 'creatorId' }),
    media_id: 'movie.mov',
    miniature_id: 'cover.png',
    internal_speakers: [],
    external_speakers: '',
    comments: [],
    archived: false,
  };
  const videoFile = {
    buffer: Buffer.from('video'),
    originalname: 'movie.mov',
    mimetype: 'video/quicktime',
  } as Express.Multer.File;
  const miniatureFile = {
    buffer: Buffer.from('image'),
    originalname: 'cover.png',
    mimetype: 'image/png',
  } as Express.Multer.File;

  it('uploads source files and publishes a pending transcoding job', async () => {
    const result = await usecase.execute(dto, videoFile, miniatureFile);

    expect(result).toBeInstanceOf(VideoObject);
    expect(result.transcoding_status).toBe('pending');
    expect(result.media_id).toMatch(/\/master\.m3u8$/);
    expect(Upload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        params: expect.objectContaining({
          Key: expect.stringMatching(/\/source\/original\.mov$/),
          ContentType: 'video/quicktime',
        }),
      }),
    );
    expect(Upload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        params: expect.objectContaining({
          Key: expect.stringMatching(/\/source\/miniature-original$/),
        }),
      }),
    );
    expect(queueService.publishJob).toHaveBeenCalledWith(
      expect.objectContaining({
        videoId: result.id,
        originalKey: expect.stringMatching(/\/source\/original\.mov$/),
        miniatureSourceKey: expect.stringMatching(
          /\/source\/miniature-original$/,
        ),
      }),
    );
  });

  describe('when transcoding is disabled', () => {
    const previous = { ...process.env };
    const stored = () =>
      (Upload as unknown as jest.Mock).mock.calls.map(
        ([{ params }]) => `${params.Bucket}/${params.Key}`,
      );
    const contentTypes = () =>
      (Upload as unknown as jest.Mock).mock.calls.map(
        ([{ params }]) => params.ContentType,
      );
    let disabled: CreateNewVideoUsecase;
    beforeEach(async () => {
      process.env.STOCK_MEDIA_BUCKET = 'media';
      process.env.STOCK_MINIATURE_BUCKET = 'miniature';
      queueService = { enabled: false, publishJob: jest.fn() };
      disabled = await build();
    });
    afterEach(() => {
      process.env = { ...previous };
    });

    it('publishes a recording from its source without a job', async () => {
      const image = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#00ccff' },
      })
        .png()
        .toBuffer();
      const result = await disabled.execute(
        dto,
        videoFile,
        { ...miniatureFile, buffer: image },
        {
          buffer: Buffer.from('1\n00:00:00,000 --> 00:00:01,000\nHello'),
          originalname: 'captions.srt',
        } as Express.Multer.File,
      );

      expect(result.transcoding_status).toBe('ready');
      expect(result.media_id).toBe(`${result.id}/source/original.mov`);
      expect(result.miniature_id).toBe(`miniature-${result.id}.jpg`);
      expect(result.subtitle_id).toBe(`subtitle-${result.id}.vtt`);
      expect(stored()).toEqual([
        `media/${result.id}/source/original.mov`,
        `miniature/miniature-${result.id}.jpg`,
        `media/subtitle-${result.id}.vtt`,
      ]);
      // The miniature is served as is: only the worker's JPEG rendition.
      expect(contentTypes()).toEqual([
        'video/quicktime',
        'image/jpeg',
        'text/vtt',
      ]);
      const [, [{ params }]] = (Upload as unknown as jest.Mock).mock.calls;
      expect((await sharp(params.Body).metadata()).format).toBe('jpeg');
      expect(queueService.publishJob).not.toHaveBeenCalled();
      expect(videoGateway.modifyVideo).not.toHaveBeenCalled();
    });

    it.each([
      'notes.html',
      'image.svg',
      'playlist.m3u8',
      'segment.ts',
      'recording',
      'talk.avi',
      'talk.mkv',
      'talk.ogg',
    ])(
      'refuses %s because the source would be served as is',
      async (originalname) => {
        await expect(
          disabled.execute(dto, {
            ...videoFile,
            originalname,
            mimetype: 'text/html',
          }),
        ).rejects.toThrow(new BadRequestException('Unsupported video format'));
        expect(Upload).not.toHaveBeenCalled();
        expect(videoGateway.createNewVideo).not.toHaveBeenCalled();
      },
    );

    it('stores the source with the type of its extension, never the client type', async () => {
      const result = await disabled.execute(dto, {
        ...videoFile,
        originalname: 'talk.mp4',
        mimetype: 'text/html',
      });
      expect(result.media_id).toBe(`${result.id}/source/original.mp4`);
      expect(contentTypes()).toEqual(['video/mp4']);
    });

    it('publishes no miniature when the upload is not an image', async () => {
      const result = await disabled.execute(dto, videoFile, {
        ...miniatureFile,
        buffer: Buffer.from('<script>alert(1)</script>'),
        mimetype: 'text/html',
      });
      expect(result.transcoding_status).toBe('ready');
      expect(stored()).toEqual([`media/${result.id}/source/original.mov`]);
    });
  });

  describe('with a recording above the worker source limit (UPLOAD_MAX_BYTES)', () => {
    const previous = process.env.UPLOAD_MAX_BYTES;
    beforeEach(() => {
      process.env.UPLOAD_MAX_BYTES = '4';
    });
    afterEach(() => {
      if (previous === undefined) delete process.env.UPLOAD_MAX_BYTES;
      else process.env.UPLOAD_MAX_BYTES = previous;
    });
    const recording = {
      ...videoFile,
      originalname: 'event_20260101.mp4',
      mimetype: 'application/octet-stream',
    };

    it('publishes it from its source instead of queueing a job the worker would refuse', async () => {
      const result = await usecase.execute(dto, recording);
      expect(result.transcoding_status).toBe('ready');
      expect(result.media_id).toBe(`${result.id}/source/original.mp4`);
      expect(queueService.publishJob).not.toHaveBeenCalled();
    });

    it('still queues a recording at the limit', async () => {
      process.env.UPLOAD_MAX_BYTES = String(recording.buffer.length);
      const result = await usecase.execute(dto, recording);
      expect(result.transcoding_status).toBe('pending');
      expect(queueService.publishJob).toHaveBeenCalled();
    });

    it('refuses it when browsers cannot play the source as is', async () => {
      await expect(
        usecase.execute(dto, { ...recording, originalname: 'talk.mkv' }),
      ).rejects.toThrow(new BadRequestException('Unsupported video format'));
      expect(Upload).not.toHaveBeenCalled();
    });
  });

  it('types the recorder source from its extension when transcoding', async () => {
    // The recorder posts its .mp4 as application/octet-stream.
    await usecase.execute(dto, {
      ...videoFile,
      originalname: 'event_20260101.mp4',
      mimetype: 'application/octet-stream',
    });
    expect(
      (Upload as unknown as jest.Mock).mock.calls[0][0].params.ContentType,
    ).toBe('video/mp4');
  });
});
