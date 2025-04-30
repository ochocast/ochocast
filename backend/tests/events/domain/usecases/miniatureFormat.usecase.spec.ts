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
    done: jest.fn().mockResolvedValue({ Location: 'https://mock-s3-url.com/miniature.jpg' }),
  })),
}));

jest.mock('sharp', () => jest.fn().mockReturnValue({
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toFile: jest.fn().mockResolvedValue(true),
}));

jest.mock('fluent-ffmpeg', () => {
  const mockFfmpeg = {
    videoCodec: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    format: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    save: jest.fn().mockReturnThis(),
  };
  return Object.assign(jest.fn(() => mockFfmpeg), {
    setFfmpegPath: jest.fn(),
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

    createNewVideoUsecase = module.get<CreateNewVideoUsecase>(CreateNewVideoUsecase);
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

    const mockVideoFile = { buffer: Buffer.from('fake video data') } as Express.Multer.File;
    const miniatureFile = { buffer: Buffer.from('mock miniature data') } as Express.Multer.File;

    (videoGateway.createNewVideo as jest.Mock).mockResolvedValue(undefined);

    const result = await createNewVideoUsecase.execute(dto, mockVideoFile, miniatureFile);

    expect(result).toBeInstanceOf(VideoObject);
    expect(sharp).toHaveBeenCalledWith(miniatureFile.buffer);
    expect(sharp().resize).toHaveBeenCalledWith(1280, 720);
    expect(sharp().jpeg).toHaveBeenCalledWith({ quality: 80 });
    expect(sharp().toFile).toHaveBeenCalled();
    expect(Upload).toHaveBeenCalledTimes(1);
  });
});