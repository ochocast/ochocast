import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class UploadConfigFileDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'The config file to upload (YAML format)',
  })
  file: Express.Multer.File;

  @ApiProperty({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
    description: 'Array of image files to upload',
    required: false,
  })
  @IsOptional()
  @IsArray()
  images?: Express.Multer.File[];

  @ApiProperty({
    type: 'array',
    items: {
      type: 'string',
    },
    description: 'Array of image IDs corresponding to the uploaded images',
    required: false,
    example: ['image1', 'image2', 'image3'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  imageIds?: string[];
}
