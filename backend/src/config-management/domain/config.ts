import { ApiProperty } from '@nestjs/swagger';

export class ConfigObject {
  @ApiProperty({
    example: '4ea6d8c0-8819-4378-bfee-98bd1bd50be0',
    description: 'The unique identifier of the config file.',
  })
  id: string;

  @ApiProperty({
    example: 'https://s3.amazonaws.com/bucket/config/app-config.json',
    description: 'The URL of the config file.',
  })
  fileUrl: string;

  @ApiProperty({
    example: '2024-01-15T10:30:00Z',
    description: 'The date when the config file was created.',
  })
  createdAt: Date;

  constructor(id: string, fileUrl: string, createdAt: Date) {
    this.id = id;
    this.fileUrl = fileUrl;
    this.createdAt = createdAt;
  }
}
