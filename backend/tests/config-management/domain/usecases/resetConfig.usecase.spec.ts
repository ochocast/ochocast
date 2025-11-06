import { ResetConfigUsecase } from '../../../../src/config-management/domain/usecases/resetConfig.usecase';
import { IConfigGateway } from '../../../../src/config-management/domain/gateways/config.gateway';
import { IUserGateway } from '../../../../src/users/domain/gateways/users.gateway';
import { UserObject } from '../../../../src/users/domain/user';
import { ForbiddenException } from '@nestjs/common';

describe('ResetConfigUsecase', () => {
  let resetConfigUsecase: ResetConfigUsecase;
  let configGatewayMock: jest.Mocked<IConfigGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;

  const mockUser: UserObject = {
    id: 'user-id',
    firstName: 'Admin',
    lastName: 'User',
    username: 'Username',
    email: 'admin@example.com',
    role: 'admin',
    description: 'Administrator',
    comments: [],
    events: [],
    videos: [],
    videosAsSpeaker: [],
    createdAt: new Date(),
    picture_id: 'profile-pic-id',
  };

  beforeEach(() => {
    configGatewayMock = {
      addConfigFile: jest.fn(),
      getLatestConfigFile: jest.fn(),
      deleteConfigFile: jest.fn(),
      deleteAllConfigFiles: jest.fn(),
    };

    userGatewayMock = {
      getUserByEmail: jest.fn(),
      createNewUser: jest.fn(),
      getUsers: jest.fn(),
      loginUser: jest.fn(),
      getListUsers: jest.fn(),
      getUserById: jest.fn(),
      addFavoriteVideo: jest.fn(),
      removeFavoriteVideo: jest.fn(),
      isVideoFavorite: jest.fn(),
      getFavoriteVideos: jest.fn(),
      updateUserProfile: jest.fn(),
      addLikedComment: jest.fn(),
      removeLikedComment: jest.fn(),
      getLikedComment: jest.fn(),
    };

    resetConfigUsecase = new ResetConfigUsecase(
      configGatewayMock,
      userGatewayMock,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should successfully reset config when user is admin', async () => {
      // Arrange
      const userEmail = 'admin@example.com';
      userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);
      configGatewayMock.deleteAllConfigFiles.mockResolvedValue(true);

      // Act
      const result = await resetConfigUsecase.execute(userEmail);

      // Assert
      expect(userGatewayMock.getUserByEmail).toHaveBeenCalledWith(userEmail);
      expect(configGatewayMock.deleteAllConfigFiles).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ message: 'Configuration reset successfully' });
    });

    it('should throw ForbiddenException when user is not found', async () => {
      // Arrange
      const userEmail = 'nonexistent@example.com';
      userGatewayMock.getUserByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(resetConfigUsecase.execute(userEmail)).rejects.toThrow(
        ForbiddenException,
      );
      expect(userGatewayMock.getUserByEmail).toHaveBeenCalledWith(userEmail);
      expect(configGatewayMock.deleteAllConfigFiles).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException when user is not admin', async () => {
      // Arrange
      const userEmail = 'user@example.com';
      const regularUser = { ...mockUser, role: 'user' };
      userGatewayMock.getUserByEmail.mockResolvedValue(regularUser);

      // Act & Assert
      await expect(resetConfigUsecase.execute(userEmail)).rejects.toThrow(
        ForbiddenException,
      );
      expect(userGatewayMock.getUserByEmail).toHaveBeenCalledWith(userEmail);
      expect(configGatewayMock.deleteAllConfigFiles).not.toHaveBeenCalled();
    });
  });
});
