import { VideosController } from '../../../../src/videos/infra/controllers/videos.controller';
import { VideoObject } from '../../../../src/videos/domain/video';
import { UserEntity } from '../../../../src/users/infra/gateways/entities/user.entity';
import { TagEntity } from '../../../../src/tags/infra/gateways/entities/tag.entity';
import { CommentEntity } from '../../../../src/comments/infra/gateways/entities/comment.entity';

describe('VideosController - getVideosSuggestions', () => {
  const now = new Date();

  const mockSearchVideoUsecase = {
    execute: jest.fn(),
  };

  const controller = new VideosController(
    {} as any, // createNewVideoUsecase
    {} as any, // getVideosUsecase
    {} as any, // deleteVideoUsecase
    {} as any, // deleteVideoAdminUsecase
    {} as any, // getMediaUseCase
    {} as any, // getMiniatureUseCase
    {} as any, // getSubtitleUseCase
    {} as any, // getVideosAdminUsecase
    {} as any, // modifyVideoUseCase
    mockSearchVideoUsecase as any, // searchVideoUseCase
    {} as any, // getSuggestionsUseCase
    {} as any, // restoreVideoUsecase
  );

  const mockUser: UserEntity = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    username: 'JDoe',
    role: 'user',
    description: 'A user',
    createdAt: now,
    picture_id: 'pic-001',
    events: [],
    comments: [],
    videos: [],
    videosAsSpeaker: [],
    speakingTracks: [],
    favoriteVideos: [],
    eventsSubscribe: [],
    likedComments: [],
  };

  const mockTag: TagEntity = {
    id: 'tag-456',
    name: 'AI',
    createdAt: now,
    updatedAt: now,
    videos: [],
  };

  const mockComment: CommentEntity = {
    id: 'comment-789',
    content: 'Nice!',
    createdAt: now,
    updatedAt: now,
    creator: mockUser,
    video: null as any,
    likes: 0,
    usersWhoLiked: [],
  };

  const mockVideo = new VideoObject(
    'video-1', // id
    'media-1', // media_id
    'miniature-1', // miniature_id
    'Test Video', // title
    'Video Description', // description
    [mockTag], // tags
    mockUser, // creator
    now, // createdAt
    now, // updatedAt
    [mockUser], // internal_speakers
    '["Einstein", "Turing"]', // external_speakers
    123, // eventId
    [mockComment], // comments
    false, // archived
  );

  it('should return suggested videos from usecase', async () => {
    mockSearchVideoUsecase.execute.mockResolvedValueOnce([mockVideo]);

    const result = await controller.searchVideo('test-data');

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(VideoObject);
    expect(result[0]).toMatchObject({
      id: 'video-1',
      title: 'Test Video',
      description: 'Video Description',
      creator: expect.objectContaining({
        id: 'user-123',
        firstName: 'John',
        lastName: 'Doe',
      }),
      tags: [expect.objectContaining({ id: 'tag-456', name: 'AI' })],
      comments: [
        expect.objectContaining({ id: 'comment-789', content: 'Nice!' }),
      ],
      archived: false,
    });

    expect(mockSearchVideoUsecase.execute).toHaveBeenCalledWith('test-data');
  });

  it('should throw if usecase throws', async () => {
    mockSearchVideoUsecase.execute.mockRejectedValueOnce(
      new Error('Something went wrong'),
    );

    await expect(controller.searchVideo('error-case')).rejects.toThrow(
      'Something went wrong',
    );
  });
});
