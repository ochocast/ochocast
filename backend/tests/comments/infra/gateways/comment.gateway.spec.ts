import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CommentObject } from 'src/comments/domain/comment';
import { CommentGateway } from 'src/comments/infra/gateways/comment.gateway';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';
import { Repository } from 'typeorm';

describe('CommentGateway', () => {
  let gateway: CommentGateway;
  let repository: jest.Mocked<Repository<CommentEntity>>;

  const now = new Date();

  const mockUser: UserEntity = {
    id: 'user1',
    firstName: 'Alice',
    lastName: 'Doe',
    email: 'alice@example.com',
    role: 'user',
    description: 'dev',
    createdAt: now,
    picture_id: 'pic123',
    comments: [],
    events: [],
    videos: [],
    videosAsSpeaker: [],
  } as any;

  const mockVideo: VideoEntity = {
    id: 'video1',
    title: 'A cool video',
    description: 'some desc',
    streamKey: '123',
    closed: false,
    createdAt: now,
    comments: [],
    event: {} as any,
    speakers: [],
    user: mockUser,
  } as any;

  const mockCommentEntity: CommentEntity = new CommentEntity({
    id: 'comment1',
    content: 'This is a comment',
    creator: mockUser,
    video: mockVideo,
    createdAt: now,
    updatedAt: now,
  });

  const mockCommentObject: CommentObject = new CommentObject(
    'comment1',
    'parentId',
    mockUser,
    mockVideo,
    'This is a comment',
    now,
    now,
    0,
  );

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        CommentGateway,
        {
          provide: getRepositoryToken(CommentEntity),
          useValue: {
            save: jest.fn(),
            findOneBy: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    gateway = moduleRef.get(CommentGateway);
    repository = moduleRef.get(getRepositoryToken(CommentEntity));
  });

  it('should create a new comment', async () => {
    repository.save.mockResolvedValueOnce(mockCommentEntity);

    const result = await gateway.createNewComment(mockCommentObject);

    expect(repository.save).toHaveBeenCalledWith(expect.any(CommentEntity));
    expect(result).toEqual(mockCommentEntity);
  });

  it('should get comments by video ID', async () => {
    const mockBuilder: any = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockCommentEntity]),
    };
    repository.createQueryBuilder.mockReturnValue(mockBuilder);

    const result = await gateway.getComments('video1');

    expect(repository.createQueryBuilder).toHaveBeenCalledWith('comment');
    expect(mockBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'comment.creator',
      'creator',
    );
    expect(mockBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
      'comment.video',
      'video',
    );
    expect(mockBuilder.where).toHaveBeenCalledWith(
      'comment.videoId = :videoId',
      { videoId: 'video1' },
    );
    expect(mockBuilder.orderBy).toHaveBeenCalledWith(
      'comment.createdAt',
      'DESC',
    );
    expect(result).toEqual([mockCommentEntity]);
  });

  it('should delete a comment by ID', async () => {
    repository.findOneBy.mockResolvedValueOnce(mockCommentEntity);
    repository.remove.mockResolvedValueOnce(mockCommentEntity);

    const result = await gateway.deleteComment('comment1');

    expect(repository.findOneBy).toHaveBeenCalledWith({ id: 'comment1' });
    expect(repository.remove).toHaveBeenCalledWith(mockCommentEntity);
    expect(result).toEqual(mockCommentEntity);
  });
});
