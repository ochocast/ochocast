import { NotFoundException } from '@nestjs/common';
import { VideoGateway } from 'src/videos/infra/gateways/video.gateway';
import { Repository, Not } from 'typeorm';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';
import { S3Client } from '@aws-sdk/client-s3';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

describe('VideoGateway', () => {
  let videoGateway: VideoGateway;
  let videoRepositoryMock: jest.Mocked<Partial<Repository<VideoEntity>>>;
  let s3ClientMock: Partial<S3Client>;

  const now = new Date();

  const referenceVideo: VideoEntity = {
    id: 'video-1',
    title: 'Reference Video',
    description: 'Reference description',
    tags: [{ name: 'AI' }] as any,
    creator: { id: 'user-1', firstName: 'Alice', lastName: 'Smith' } as any,
    archived: false,
    createdAt: now,
  } as VideoEntity;

  const otherVideos: VideoEntity[] = [
    {
      id: 'video-2',
      title: 'Matching Tag Video',
      tags: [{ name: 'AI' }] as any,
      creator: { id: 'user-1' } as any,
      archived: false,
      createdAt: new Date(now.getTime() - 1000),
    } as VideoEntity,
    {
      id: 'video-3',
      title: 'Different User Video',
      tags: [{ name: 'ML' }] as any,
      creator: { id: 'user-2' } as any,
      archived: false,
      createdAt: new Date(now.getTime() - 5000),
    } as VideoEntity,
    {
      id: 'video-4',
      title: 'Another Match',
      tags: [{ name: 'AI' }] as any,
      creator: { id: 'user-2' } as any,
      archived: false,
      createdAt: new Date(now.getTime() - 100),
    } as VideoEntity,
  ];

  beforeEach(() => {
    videoRepositoryMock = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'video-5',
            title: 'Suggested Video',
            description: 'A suggestion',
            archived: false,
            creator: { firstName: 'John', lastName: 'Doe', email: 'j@doe.com' },
            tags: [{ name: 'AI' }],
          },
        ]),
      }),
    };

    s3ClientMock = {};

    videoGateway = new VideoGateway(
      videoRepositoryMock as any,
      s3ClientMock as any,
    );
  });

  /*
    Normal case: searchVideo
   */
  it('should build query and return suggested videos', async () => {
    const result = await videoGateway.searchVideo('AI');

    expect(videoRepositoryMock.createQueryBuilder).toHaveBeenCalledWith(
      'video',
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Suggested Video');
  });

  /*
    Edge case: no match
   */
  it('should return empty array if no video matches the filter', async () => {
    const emptyQueryBuilder: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    (videoRepositoryMock.createQueryBuilder as jest.Mock).mockReturnValue(
      emptyQueryBuilder,
    );

    const result = await videoGateway.searchVideo('non-existent');

    expect(result).toEqual([]);
    expect(emptyQueryBuilder.getMany).toHaveBeenCalled();
  });

  /*
    getSuggestions — Normal case
   */
  it('should return top 3 scored videos as suggestions', async () => {
    videoRepositoryMock.findOne = jest.fn().mockResolvedValue(referenceVideo);
    videoRepositoryMock.find = jest.fn().mockResolvedValue(otherVideos);

    const result = await videoGateway.getSuggestions('video-1');

    expect(videoRepositoryMock.findOne).toHaveBeenCalledWith({
      where: { id: 'video-1' },
      relations: ['tags', 'creator'],
    });

    expect(videoRepositoryMock.find).toHaveBeenCalledWith({
      where: { id: Not('video-1'), archived: false },
      relations: ['tags', 'creator'],
    });

    expect(result).toHaveLength(3);
    expect(result[0].id).toBeDefined();
  });

  /*
    getSuggestions — Error case: video not found
   */
  it('should throw NotFoundException if reference video not found', async () => {
    videoRepositoryMock.findOne = jest.fn().mockResolvedValue(null);

    await expect(videoGateway.getSuggestions('bad-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
