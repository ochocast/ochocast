import { Test, TestingModule } from '@nestjs/testing';
import { CreateNewVideoUsecase } from 'src/videos/domain/usecases/createNewVideo.usecase';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { mock } from 'jest-mock-extended';
import { CreateVideoDto } from 'src/videos/infra/controllers/dto/create-video.dto';
import { VideoObject } from 'src/videos/domain/video';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import * as sharp from 'sharp';

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({
    done: jest
      .fn()
      .mockResolvedValue({ Location: 'https://mock-s3-url.com/miniature.jpg' }),
  })),
}));

jest.mock('sharp', () => {
  const resizeMock = jest.fn().mockReturnThis();
  const jpegMock = jest.fn().mockReturnThis();
  const toFileMock = jest.fn().mockResolvedValue(true);

  const sharpMock = jest.fn(() => ({
    resize: resizeMock,
    jpeg: jpegMock,
    toFile: toFileMock,
  }));

  // Exposer les mocks pour pouvoir les tester
  (sharpMock as any).resizeMock = resizeMock;
  (sharpMock as any).jpegMock = jpegMock;
  (sharpMock as any).toFileMock = toFileMock;

  return sharpMock;
});

jest.mock('fluent-ffmpeg', () => {
  const ffmpegMock = jest.fn(() => ffmpegMock);
  ffmpegMock.videoCodec = jest.fn(() => ffmpegMock);
  ffmpegMock.outputOptions = jest.fn(() => ffmpegMock);
  ffmpegMock.format = jest.fn(() => ffmpegMock);
  ffmpegMock.output = jest.fn(() => ffmpegMock);
  ffmpegMock.run = jest.fn(() => ffmpegMock);
  ffmpegMock.on = jest.fn(function (event, cb) {
    if (event === 'end') {
      setImmediate(cb);
    }
    return ffmpegMock;
  });
  ffmpegMock.save = jest.fn(() => ffmpegMock);
  ffmpegMock.setFfmpegPath = jest.fn();
  ffmpegMock.setFfprobePath = jest.fn();
  ffmpegMock.ffprobe = jest.fn((inputPath, callback) => {
    callback(null, {
      format: {
        duration: 120,
      },
    });
  });

  return Object.assign(ffmpegMock, {
    setFfmpegPath: jest.fn(),
    setFfprobePath: jest.fn(),
    ffprobe: ffmpegMock.ffprobe,
  });
});

jest.mock('node:fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('fake data')),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe('CreateNewVideoUsecase - Miniature Processing', () => {
  let createNewVideoUsecase: CreateNewVideoUsecase;
  let videoGateway: IVideoGateway;
  let s3Client: S3Client;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateNewVideoUsecase,
        { provide: 'VideoGateway', useValue: mock<IVideoGateway>() },
        { provide: 's3Client', useValue: mock<S3Client>() },
      ],
    }).compile();

    createNewVideoUsecase = module.get<CreateNewVideoUsecase>(
      CreateNewVideoUsecase,
    );
    videoGateway = module.get<IVideoGateway>('VideoGateway');
    s3Client = module.get<S3Client>('s3Client');
  });

  it('should resize the video miniature to 1280x720 and upload it to S3', async () => {
    const dto: CreateVideoDto = {
      title: 'Test Video',
      description: 'A test video with miniature resizing',
      tags: [new TagEntity({ name: 'test' }), new TagEntity({ name: 'video' })],
      creator: new UserEntity({ id: 'creatorId', firstName: 'Creator Name' }),
      media_id: 'test-media',
      miniature_id: 'test-miniature',
      internal_speakers: [],
      external_speakers: '',
      comments: [],
      archived: false,
    };

    const mockVideoFile = {
      buffer: Buffer.from('fake video data'),
    } as Express.Multer.File;
    const miniatureFile = {
      buffer: Buffer.from('mock miniature data'),
    } as Express.Multer.File;

    (videoGateway.createNewVideo as jest.Mock).mockResolvedValue(undefined);

    const result = await createNewVideoUsecase.execute(
      dto,
      mockVideoFile,
      miniatureFile,
    );

    expect(result).toBeInstanceOf(VideoObject);
    expect(sharp).toHaveBeenCalledWith(miniatureFile.buffer);
    expect(sharp().resize).toHaveBeenCalledWith(1280, 720, {
      fit: 'cover',
      position: 'center',
    });
    expect(sharp().jpeg).toHaveBeenCalledWith({ quality: 80 });
    expect(sharp().toFile).toHaveBeenCalled();

    expect(Upload).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        params: expect.objectContaining({
          Key: expect.stringMatching(/\.mp4$/),
        }),
      }),
    );

    expect(Upload).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        params: expect.objectContaining({
          Key: expect.stringMatching(/\.jpg$/),
        }),
      }),
    );
  });
});
