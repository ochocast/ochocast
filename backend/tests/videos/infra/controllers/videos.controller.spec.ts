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
    {} as any, // incrementVideoViewsUsecase
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

  describe('getMedia', () => {
    const mediaId = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
    let previousPublicApiUrl: string | undefined;
    let getMediaUseCase: { execute: jest.Mock };
    let mediaController: VideosController;
    const requestWithHost = (host: string) =>
      ({
        protocol: 'http',
        originalUrl: `/api/videos/media/${mediaId}`,
        get: (header: string) =>
          header.toLowerCase() === 'host' ? host : undefined,
      }) as any;

    beforeEach(() => {
      previousPublicApiUrl = process.env.PUBLIC_API_URL;
      delete process.env.PUBLIC_API_URL;
      getMediaUseCase = {
        execute: jest
          .fn()
          .mockImplementation(
            async (id: string, apiBaseUrl: string) =>
              `${apiBaseUrl}/videos/media-content/${id}/master.m3u8`,
          ),
      };
      mediaController = new VideosController(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        getMediaUseCase as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    afterEach(() => {
      if (previousPublicApiUrl === undefined) {
        delete process.env.PUBLIC_API_URL;
      } else {
        process.env.PUBLIC_API_URL = previousPublicApiUrl;
      }
    });

    it('should preserve the global API prefix in HLS media URLs', async () => {
      const result = await mediaController.getMedia(
        mediaId,
        requestWithHost('localhost:3001'),
      );

      expect(result).toBe(
        `http://localhost:3001/api/videos/media-content/${mediaId}/master.m3u8`,
      );
    });

    it('should reject a non-UUID id with 400', async () => {
      await expect(
        mediaController.getMedia('video-1', requestWithHost('localhost:3001')),
      ).rejects.toMatchObject({ status: 400, message: 'Id must be an UUID' });
      expect(getMediaUseCase.execute).not.toHaveBeenCalled();
    });

    it('should reduce a malicious Host header to its origin', async () => {
      await mediaController.getMedia(mediaId, requestWithHost('evil.com/x?'));

      expect(getMediaUseCase.execute).toHaveBeenCalledWith(
        mediaId,
        'http://evil.com/api',
      );
    });

    it('should prefer PUBLIC_API_URL over the Host header', async () => {
      process.env.PUBLIC_API_URL = 'https://api.example.com/api/';

      await mediaController.getMedia(mediaId, requestWithHost('evil.com'));

      expect(getMediaUseCase.execute).toHaveBeenCalledWith(
        mediaId,
        'https://api.example.com/api',
      );
    });
  });
});
