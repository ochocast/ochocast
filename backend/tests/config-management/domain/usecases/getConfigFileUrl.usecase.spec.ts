import { GetConfigFileUrlUsecase } from '../../../../src/config-management/domain/usecases/getConfigFileUrl.usecase';
import { IConfigGateway } from '../../../../src/config-management/domain/gateways/config.gateway';
import { ConfigObject } from '../../../../src/config-management/domain/config';

describe('GetConfigFileUrlUsecase', () => {
  let getConfigFileUrlUsecase: GetConfigFileUrlUsecase;
  let configGatewayMock: jest.Mocked<IConfigGateway>;

  const mockConfig: ConfigObject = new ConfigObject(
    'config-id',
    'https://s3.amazonaws.com/bucket/config/config.json',
    new Date('2024-01-15T10:30:00Z'),
  );

  beforeEach(() => {
    configGatewayMock = {
      addConfigFile: jest.fn(),
      getLatestConfigFile: jest.fn(),
      deleteConfigFile: jest.fn(),
      deleteAllConfigFiles: jest.fn(),
    };

    getConfigFileUrlUsecase = new GetConfigFileUrlUsecase(configGatewayMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should return the URL of the latest config file when it exists', async () => {
      // Arrange
      configGatewayMock.getLatestConfigFile.mockResolvedValue(mockConfig);

      // Act
      const result = await getConfigFileUrlUsecase.execute();

      // Assert
      expect(configGatewayMock.getLatestConfigFile).toHaveBeenCalledTimes(1);
      expect(result).toBe('https://s3.amazonaws.com/bucket/config/config.json');
    });

    it('should return process.env.DEFAULT_CONFIG_URL when no config file exists', async () => {
      // Arrange
      configGatewayMock.getLatestConfigFile.mockResolvedValue(null);

      // Act
      const result = await getConfigFileUrlUsecase.execute();

      // Assert
      expect(configGatewayMock.getLatestConfigFile).toHaveBeenCalledTimes(1);
      expect(result).toBe('default-config');
    });
  });
});
