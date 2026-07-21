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

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({
    done: jest.fn().mockResolvedValue({}),
  })),
}));

describe('CreateNewVideoUsecase - asynchronous transcoding', () => {
  let usecase: CreateNewVideoUsecase;
  let videoGateway: jest.Mocked<IVideoGateway>;
  let queueService: jest.Mocked<Pick<QueueService, 'publishJob'>>;

  beforeEach(async () => {
    videoGateway = mock<IVideoGateway>();
    queueService = { publishJob: jest.fn().mockResolvedValue(undefined) };
    videoGateway.createNewVideo.mockImplementation(async (video) => video);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateNewVideoUsecase,
        { provide: 'VideoGateway', useValue: videoGateway },
        { provide: 's3Client', useValue: mock<S3Client>() },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();
    usecase = module.get(CreateNewVideoUsecase);
  });

  it('uploads source files and publishes a pending transcoding job', async () => {
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

    const result = await usecase.execute(dto, videoFile, miniatureFile);

    expect(result).toBeInstanceOf(VideoObject);
    expect(result.transcoding_status).toBe('pending');
    expect(result.media_id).toMatch(/\/master\.m3u8$/);
    expect(result.subtitle_id).toBeUndefined();
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
        subtitle_id: undefined,
      }),
    );
  });
});
