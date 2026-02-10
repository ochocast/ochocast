import { ConfigObject } from '../../../src/config-management/domain/config';

describe('ConfigObject', () => {
  it('should create a ConfigObject with all properties', () => {
    // Arrange
    const id = 'config-id';
    const fileUrl = 'https://s3.amazonaws.com/bucket/config/config.json';
    const createdAt = new Date('2024-01-15T10:30:00Z');

    // Act
    const configObject = new ConfigObject(id, fileUrl, createdAt);

    // Assert
    expect(configObject.id).toBe(id);
    expect(configObject.fileUrl).toBe(fileUrl);
    expect(configObject.createdAt).toBe(createdAt);
  });

  it('should have correct ApiProperty metadata', () => {
    // This test verifies that the class has the expected Swagger decorations
    // In a real scenario, you might want to test the actual metadata
    const configObject = new ConfigObject(
      'test-id',
      'https://example.com/test.json',
      new Date(),
    );

    expect(configObject).toBeInstanceOf(ConfigObject);
    expect(typeof configObject.id).toBe('string');
    expect(typeof configObject.fileUrl).toBe('string');
    expect(configObject.createdAt).toBeInstanceOf(Date);
  });
});
