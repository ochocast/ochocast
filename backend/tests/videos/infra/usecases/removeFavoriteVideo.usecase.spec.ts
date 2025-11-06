import { RemoveFavoriteVideoUsecase } from 'src/users/domain/usecases/removeFavoriteVideo.usecase';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';

describe('RemoveFavoriteVideoUsecase', () => {
  let usecase: RemoveFavoriteVideoUsecase;
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

    usecase = new RemoveFavoriteVideoUsecase(userGatewayMock);
  });

  it('should call removeFavoriteVideo with correct params', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);

    await usecase.execute(userEmail, videoId);

    expect(userGatewayMock.getUserByEmail).toHaveBeenCalledWith(userEmail);
    expect(userGatewayMock.removeFavoriteVideo).toHaveBeenCalledWith(
      userId,
      videoId,
    );
    expect(userGatewayMock.removeFavoriteVideo).toHaveBeenCalledTimes(1);
  });

  it('should throw if removeFavoriteVideo fails', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);
    userGatewayMock.removeFavoriteVideo.mockRejectedValue(
      new Error('DB error'),
    );

    await expect(usecase.execute(userEmail, videoId)).rejects.toThrow(
      'DB error',
    );
  });

  it('should throw if user is not found', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValue(null);

    await expect(usecase.execute(userEmail, videoId)).rejects.toThrow(
      'User not found',
    );
  });
});
