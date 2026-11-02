import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePublicationRequestDto {
  @ApiProperty() @IsUUID() recordingId: string;

  @ApiProperty({ description: 'Speaker whose channel receives the video' })
  @IsUUID()
  targetUserId: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  tags?: unknown[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  internalSpeakers?: unknown[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  externalSpeakers?: string;
}

export class AcceptPublicationRequestDto {
  @ApiProperty({ description: 'Video created on the speaker channel' })
  @IsUUID()
  videoId: string;
}

export class RefusePublicationRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
