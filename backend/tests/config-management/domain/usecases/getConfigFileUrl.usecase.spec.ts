import { GetConfigFileUrlUsecase } from '../../../../src/config-management/domain/usecases/getConfigFileUrl.usecase';
import { IConfigGateway } from '../../../../src/config-management/domain/gateways/config.gateway';
import { ConfigObject } from '../../../../src/config-management/domain/config';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Mock getSignedUrl
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

describe('GetConfigFileUrlUsecase', () => {
  let getConfigFileUrlUsecase: GetConfigFileUrlUsecase;
  let configGatewayMock: jest.Mocked<IConfigGateway>;
  let s3ClientMock: jest.Mocked<S3Client>;
  let getSignedUrlMock: jest.MockedFunction<typeof getSignedUrl>;

  const mockConfig: ConfigObject = new ConfigObject(
    'config-id',
    'config/config.json',
    new Date('2024-01-15T10:30:00Z'),
  );

  beforeEach(() => {
    configGatewayMock = {
      addConfigFile: jest.fn(),
      getLatestConfigFile: jest.fn(),
      deleteConfigFile: jest.fn(),
      deleteAllConfigFiles: jest.fn(),
    };

    s3ClientMock = {
      send: jest.fn(),
      config: {
        endpointProvider: jest.fn(),
        region: jest.fn(),
        credentials: jest.fn(),
      },
    } as any;

    getSignedUrlMock = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

    getConfigFileUrlUsecase = new GetConfigFileUrlUsecase(
      configGatewayMock,
      s3ClientMock,
    );

    // Mock environment variable
    process.env.STOCK_BRANDING_BUCKET = 'test-bucket';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.STOCK_BRANDING_BUCKET;
  });

  describe('execute', () => {
    it('should return a signed URL when config file exists', async () => {
      // Arrange
      const expectedSignedUrl =
        'https://s3.amazonaws.com/test-bucket/config/config.json?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=...';

      configGatewayMock.getLatestConfigFile.mockResolvedValue(mockConfig);
      getSignedUrlMock.mockResolvedValue(expectedSignedUrl);

      // Act
      const result = await getConfigFileUrlUsecase.execute();

      // Assert
      expect(configGatewayMock.getLatestConfigFile).toHaveBeenCalledTimes(1);
      expect(getSignedUrlMock).toHaveBeenCalledWith(
        s3ClientMock,
        expect.any(GetObjectCommand),
        { expiresIn: 3600 },
      );
      expect(result).toBe(expectedSignedUrl);
    });

    it('should return "default-config" when no config file exists', async () => {
      // Arrange
      configGatewayMock.getLatestConfigFile.mockResolvedValue(null);

      // Act
      const result = await getConfigFileUrlUsecase.execute();

      // Assert
      expect(configGatewayMock.getLatestConfigFile).toHaveBeenCalledTimes(1);
      expect(getSignedUrlMock).not.toHaveBeenCalled();
      expect(result).toBe('default-config');
    });

    it('should call GetObjectCommand with correct parameters', async () => {
      // Arrange
      const expectedSignedUrl =
        'https://s3.amazonaws.com/test-bucket/config/config.json?signed';

      configGatewayMock.getLatestConfigFile.mockResolvedValue(mockConfig);
      getSignedUrlMock.mockResolvedValue(expectedSignedUrl);

      // Act
      await getConfigFileUrlUsecase.execute();

      // Assert
      expect(getSignedUrlMock).toHaveBeenCalledWith(
        s3ClientMock,
        expect.objectContaining({
          input: {
            Bucket: 'test-bucket',
            Key: 'config/config.json',
          },
        }),
        { expiresIn: 3600 },
      );
    });
  });
});
