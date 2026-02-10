import { AddConfigFileUsecase } from '../../../../src/config-management/domain/usecases/addConfigFile.usecase';
import { IConfigGateway } from '../../../../src/config-management/domain/gateways/config.gateway';
import { IUserGateway } from '../../../../src/users/domain/gateways/users.gateway';
import { ConfigObject } from '../../../../src/config-management/domain/config';
import { UserObject } from '../../../../src/users/domain/user';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

jest.mock('@aws-sdk/lib-storage', () => ({
  Upload: jest.fn().mockImplementation(() => ({
    done: jest.fn(),
  })),
}));

describe('AddConfigFileUsecase', () => {
  let addConfigFileUsecase: AddConfigFileUsecase;
  let configGatewayMock: jest.Mocked<IConfigGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let s3ClientMock: jest.Mocked<S3Client>;
  let consoleErrorSpy: jest.SpyInstance;

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

  const mockConfigFile: Express.Multer.File = {
    fieldname: 'file',
    originalname: 'config.yaml',
    encoding: '7bit',
    mimetype: 'text/yaml',
    size: 1024,
    buffer: Buffer.from('setting: value'),
    destination: '',
    filename: '',
    path: '',
    stream: null,
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

    s3ClientMock = {} as jest.Mocked<S3Client>;

    addConfigFileUsecase = new AddConfigFileUsecase(
      configGatewayMock,
      userGatewayMock,
      s3ClientMock,
    );

    process.env.STOCK_BRANDING_BUCKET = 'test-bucket';

    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('execute', () => {
    it('should successfully upload config file when user is admin', async () => {
      // Arrange
      const userEmail = 'admin@example.com';
      userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);

      const mockUploadResult = {
        Location: 'https://s3.amazonaws.com/test-bucket/config/mock-file.yaml',
      };

      const uploadMock = {
        done: jest.fn().mockResolvedValue(mockUploadResult),
      };

      (Upload as unknown as jest.Mock).mockImplementation(() => uploadMock);

      const expectedConfig = new ConfigObject(
        'mock-uuid',
        expect.stringMatching(/^config\/config-\d+-mock-uuid\.yaml$/),
        expect.any(Date),
      );

      configGatewayMock.addConfigFile.mockResolvedValue(expectedConfig);

      // Act
      const result = await addConfigFileUsecase.execute(
        userEmail,
        mockConfigFile,
      );

      // Assert
      expect(userGatewayMock.getUserByEmail).toHaveBeenCalledWith(userEmail);
      expect(Upload).toHaveBeenCalledWith({
        client: s3ClientMock,
        params: {
          Bucket: 'test-bucket',
          Key: expect.stringMatching(/^config\/config-\d+-mock-uuid\.yaml$/),
          Body: mockConfigFile.buffer,
          ContentType: 'text/yaml',
        },
      });
      expect(configGatewayMock.addConfigFile).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'mock-uuid',
          fileUrl: expect.stringMatching(
            /^config\/config-\d+-mock-uuid\.yaml$/,
          ),
          createdAt: expect.any(Date),
        }),
      );
      expect(result).toEqual(expectedConfig);
    });

    it('should throw ForbiddenException when user is not found', async () => {
      // Arrange
      const userEmail = 'nonexistent@example.com';
      userGatewayMock.getUserByEmail.mockResolvedValue(null);

      // Act & Assert
      await expect(
        addConfigFileUsecase.execute(userEmail, mockConfigFile),
      ).rejects.toThrow(ForbiddenException);
      expect(userGatewayMock.getUserByEmail).toHaveBeenCalledWith(userEmail);
    });

    it('should throw ForbiddenException when user is not admin', async () => {
      // Arrange
      const userEmail = 'user@example.com';
      const regularUser = { ...mockUser, role: 'user' };
      userGatewayMock.getUserByEmail.mockResolvedValue(regularUser);

      // Act & Assert
      await expect(
        addConfigFileUsecase.execute(userEmail, mockConfigFile),
      ).rejects.toThrow(ForbiddenException);
      expect(userGatewayMock.getUserByEmail).toHaveBeenCalledWith(userEmail);
    });

    it('should throw BadRequestException when no file is provided', async () => {
      // Arrange
      const userEmail = 'admin@example.com';
      userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(
        addConfigFileUsecase.execute(userEmail, null),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when file type is not YAML', async () => {
      // Arrange
      const userEmail = 'admin@example.com';
      const invalidFile = { ...mockConfigFile, mimetype: 'application/json' };
      userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);

      // Act & Assert
      await expect(
        addConfigFileUsecase.execute(userEmail, invalidFile),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept application/x-yaml mimetype', async () => {
      // Arrange
      const userEmail = 'admin@example.com';
      const yamlFile = { ...mockConfigFile, mimetype: 'application/x-yaml' };
      userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);

      const uploadMock = {
        done: jest.fn().mockResolvedValue({}),
      };

      (Upload as unknown as jest.Mock).mockImplementation(() => uploadMock);

      const expectedConfig = new ConfigObject(
        'mock-uuid',
        expect.stringMatching(/^config\/config-\d+-mock-uuid\.yaml$/),
        expect.any(Date),
      );

      configGatewayMock.addConfigFile.mockResolvedValue(expectedConfig);

      // Act
      const result = await addConfigFileUsecase.execute(userEmail, yamlFile);

      // Assert
      expect(result).toEqual(expectedConfig);
    });

    it('should accept text/plain mimetype', async () => {
      // Arrange
      const userEmail = 'admin@example.com';
      const textFile = { ...mockConfigFile, mimetype: 'text/plain' };
      userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);

      const uploadMock = {
        done: jest.fn().mockResolvedValue({}),
      };

      (Upload as unknown as jest.Mock).mockImplementation(() => uploadMock);

      const expectedConfig = new ConfigObject(
        'mock-uuid',
        expect.stringMatching(/^config\/config-\d+-mock-uuid\.yaml$/),
        expect.any(Date),
      );

      configGatewayMock.addConfigFile.mockResolvedValue(expectedConfig);

      // Act
      const result = await addConfigFileUsecase.execute(userEmail, textFile);

      // Assert
      expect(result).toEqual(expectedConfig);
    });

    it('should throw BadRequestException when S3 upload fails', async () => {
      // Arrange
      const userEmail = 'admin@example.com';
      userGatewayMock.getUserByEmail.mockResolvedValue(mockUser);

      const uploadMock = {
        done: jest.fn().mockRejectedValue(new Error('S3 upload failed')),
      };

      (Upload as unknown as jest.Mock).mockImplementation(() => uploadMock);

      // Act & Assert
      await expect(
        addConfigFileUsecase.execute(userEmail, mockConfigFile),
      ).rejects.toThrow(BadRequestException);

      // Verify that console.error was called with the expected message
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to upload config file:',
        expect.any(Error),
      );
    });
  });
});
