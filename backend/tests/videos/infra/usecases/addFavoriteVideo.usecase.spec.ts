import { AddFavoriteVideoUsecase } from 'src/users/domain/usecases/addFavoriteVideo.usecase';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';

describe('AddFavoriteVideoUsecase', () => {
  let addFavoriteVideoUsecase: AddFavoriteVideoUsecase;
  let userGatewayMock: jest.Mocked<IUserGateway>;

  const mockEmail = 'test@example.com';
  const mockUserId = 'user-123';
  const mockVideoId = 'video-456';

  const mockUser: UserObject = {
    id: mockUserId,
    email: mockEmail,
    firstName: 'John',
    lastName: 'Doe',
    username: 'JDoe',
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

    addFavoriteVideoUsecase = new AddFavoriteVideoUsecase(userGatewayMock);
  });

  it('should call userGateway.addFavoriteVideo with correct params', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValueOnce(mockUser);

    await addFavoriteVideoUsecase.execute(mockEmail, mockVideoId);

    expect(userGatewayMock.addFavoriteVideo).toHaveBeenCalledWith(
      mockUserId,
      mockVideoId,
    );
    expect(userGatewayMock.addFavoriteVideo).toHaveBeenCalledTimes(1);
  });

  it('should throw an error if addFavoriteVideo fails', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValueOnce(mockUser);
    userGatewayMock.addFavoriteVideo.mockRejectedValueOnce(
      new Error('DB failed'),
    );

    await expect(
      addFavoriteVideoUsecase.execute(mockEmail, mockVideoId),
    ).rejects.toThrow('DB failed');
  });

  it('should throw "User not found" if email is invalid', async () => {
    userGatewayMock.getUserByEmail.mockResolvedValueOnce(null);

    await expect(
      addFavoriteVideoUsecase.execute('invalid@email.com', mockVideoId),
    ).rejects.toThrow('User not found');
  });
});
