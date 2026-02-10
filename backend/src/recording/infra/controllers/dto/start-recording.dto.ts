import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartRecordingDto {
  @ApiProperty({ description: 'Track ID to record' })
  @IsNotEmpty()
  @IsString()
  trackId: string;

  @ApiProperty({ description: 'SFU Room ID' })
  @IsNotEmpty()
  @IsString()
  roomId: string;

  @ApiProperty({ description: 'SFU Room Key for authentication' })
  @IsNotEmpty()
  @IsString()
  roomKey: string;

  @ApiProperty({ description: 'SFU Server URL' })
  @IsNotEmpty()
  @IsString()
  sfuUrl: string;
}
