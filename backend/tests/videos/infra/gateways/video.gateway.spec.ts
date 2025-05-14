import { VideoGateway } from '../../../../src/videos/infra/gateways/video.gateway';
import { Repository } from 'typeorm';
import { VideoEntity } from '../../../../src/videos/infra/gateways/entities/video.entity';
import { S3Client } from '@aws-sdk/client-s3';

describe('VideoGateway - getVideosSuggestions', () => {
  let videoGateway: VideoGateway;
  let videoRepositoryMock: Partial<Repository<VideoEntity>>;
  let s3ClientMock: Partial<S3Client>;

  beforeEach(() => {
    // Mocker le QueryBuilder
    const mockQueryBuilder: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'video-1',
          title: 'AI in 2025',
          description: 'Trends in AI',
          archived: false,
          creator: { firstName: 'John', lastName: 'Doe', email: 'j@doe.com' },
          tags: [{ name: 'AI' }],
        },
      ]),
    };

    // Mocker le repository
    videoRepositoryMock = {
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    s3ClientMock = {};

    videoGateway = new VideoGateway(
      videoRepositoryMock as any,
      s3ClientMock as any,
    );
  });

  it('should build query and return suggested videos', async () => {
    const result = await videoGateway.getVideosSuggestions('AI');

    expect(videoRepositoryMock.createQueryBuilder).toHaveBeenCalledWith(
      'video',
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('AI in 2025');
    expect(result[0].creator.firstName).toBe('John');
    expect(result[0].tags[0].name).toBe('AI');
  });

  it('should return empty array if no video matches the filter', async () => {
    // Crée un nouveau mock de QueryBuilder avec un getMany vide
    const mockQueryBuilder: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    // Mets à jour le mock du repository pour ce test uniquement
    (videoRepositoryMock.createQueryBuilder as jest.Mock).mockReturnValue(
      mockQueryBuilder,
    );

    const result = await videoGateway.getVideosSuggestions('xyz-nonexistent');

    expect(result).toEqual([]);
    expect(videoRepositoryMock.createQueryBuilder).toHaveBeenCalledWith(
      'video',
    );
    expect(mockQueryBuilder.where).toHaveBeenCalled();
    expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    expect(mockQueryBuilder.getMany).toHaveBeenCalled();
  });
});
