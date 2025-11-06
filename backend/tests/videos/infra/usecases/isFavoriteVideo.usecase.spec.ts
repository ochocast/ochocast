import { IsFavoriteVideoUsecase } from 'src/users/domain/usecases/isFavoriteVideo.usecase';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';

describe('IsFavoriteVideoUsecase', () => {
  let usecase: IsFavoriteVideoUsecase;
  let userGatewayMock: jest.Mocked<IUserGateway>;

  const userId = 'user-123';
  const userEmail = 'test@example.com';
  const videoId = 'video-456';

  const mockUser: UserObject = {
    id: userId,
    firstName: 'Test',
    lastName: 'User',
    username: 'JDoe',
    email: userEmail,
    role: 'user',
    events: [],
    comments: [],
    videos: [],
    videosAsSpeaker: [],
    description: '',
    createdAt: new Date(),
    picture_id: '',
  };

  beforeEach(() => {
    userGatewayMock = {
      getUsers: jest.fn(),
      getListUsers: jest.fn(),
      getUserById: jest.fn(),
      getUserByEmail: jest.fn(),
      createNewUser: jest.fn(),
      loginUser: jest.fn(),
      addFavoriteVideo: jest.fn(),
      removeFavoriteVideo: jest.fn(),
      isVideoFavorite: jest.fn(),
      getFavoriteVideos: jest.fn(),
      updateUserProfile: jest.fn(),
      addLikedComment: jest.fn(),
      removeLikedComment: jest.fn(),
      getLikedComment: jest.fn(),
    };

    usecase = new IsFavoriteVideoUsecase(userGatewayMock);
  });

  it('should return true if video is favorited', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);
    userGatewayMock.isVideoFavorite.mockResolvedValue(true);

    const result = await usecase.execute(userEmail, videoId);

    expect(result).toBe(true);
    expect(userGatewayMock.getUserByEmail).toHaveBeenCalledWith(userEmail);
    expect(userGatewayMock.isVideoFavorite).toHaveBeenCalledWith(
      userId,
      videoId,
    );
  });

  it('should return false if video is not favorited', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);
    userGatewayMock.isVideoFavorite.mockResolvedValue(false);

    const result = await usecase.execute(userEmail, videoId);

    expect(result).toBe(false);
  });

  it('should throw if userGateway fails', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);
    userGatewayMock.isVideoFavorite.mockRejectedValue(new Error('DB error'));

    await expect(usecase.execute(userEmail, videoId)).rejects.toThrow(
      'DB error',
    );
  });

  it('should throw if user does not exist', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValue(null);

    await expect(usecase.execute(userEmail, videoId)).rejects.toThrow(
      'User not found',
    );
  });
});
