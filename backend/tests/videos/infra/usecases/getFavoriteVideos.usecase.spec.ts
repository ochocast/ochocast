import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { GetFavoriteVideosUsecase } from 'src/users/domain/usecases/getFavoriteVideo.usecase';
import { VideoObject } from 'src/videos/domain/video';

describe('GetFavoriteVideosUsecase', () => {
  let usecase: GetFavoriteVideosUsecase;
  let userGatewayMock: jest.Mocked<IUserGateway>;

  beforeEach(() => {
    userGatewayMock = {
      getUserByEmail: jest.fn(),
      createNewUser: jest.fn(),
      getUsers: jest.fn(),
      getUserById: jest.fn(),
      loginUser: jest.fn(),
      getListUsers: jest.fn(),
      addFavoriteVideo: jest.fn(),
      removeFavoriteVideo: jest.fn(),
      isVideoFavorite: jest.fn(),
      getFavoriteVideos: jest.fn(),
      updateUserProfile: jest.fn(),
      addLikedComment: jest.fn(),
      removeLikedComment: jest.fn(),
      getLikedComment: jest.fn(),
    };

    usecase = new GetFavoriteVideosUsecase(userGatewayMock);
  });

  it('should retrieve favorite videos from gateway', async () => {
    const mockVideos: VideoObject[] = [
      {
        id: 'video-1',
        media_id: 'media-1',
        miniature_id: 'miniature-1',
        title: 'Test Video',
        description: 'Description',
        tags: [],
        creator: {
          id: 'creator-1',
          email: 'creator@example.com',
          firstName: 'John',
          lastName: 'Doe',
          username: 'JDoe',
          role: 'user',
          description: '',
          createdAt: new Date(),
          picture_id: '',
          events: [],
          comments: [],
          videos: [],
          videosAsSpeaker: [],
          speakingTracks: [],
          favoriteVideos: [],
          eventsSubscribe: [],
          likedComments: [],
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        internal_speakers: [],
        external_speakers: '[]',
        comments: [],
        archived: false,
        views: 0,
      },
    ];

    userGatewayMock.getFavoriteVideos.mockResolvedValue(mockVideos);

    const result = await usecase.execute('user@example.com');

    expect(result).toEqual(mockVideos);
    expect(userGatewayMock.getFavoriteVideos).toHaveBeenCalledWith(
      'user@example.com',
    );
  });

  it('should handle no favorite videos', async () => {
    userGatewayMock.getFavoriteVideos.mockResolvedValue([]);

    const result = await usecase.execute('user@example.com');

    expect(result).toEqual([]);
  });

  it('should throw error on gateway failure', async () => {
    userGatewayMock.getFavoriteVideos.mockRejectedValue(
      new Error('Gateway failed'),
    );

    await expect(usecase.execute('user@example.com')).rejects.toThrow(
      'Gateway failed',
    );
  });
});
