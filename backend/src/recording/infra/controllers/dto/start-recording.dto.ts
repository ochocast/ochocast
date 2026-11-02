import { IsNotEmpty, IsString, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartRecordingDto {
  @ApiProperty({ description: 'Track ID to record' })
  @IsNotEmpty()
  @IsUUID()
  trackId: string;

  @ApiProperty({ description: 'SFU Room ID' })
  @IsNotEmpty()
  @IsUUID()
  roomId: string;

  @ApiProperty({
    description: 'Legacy field, ignored; the backend discovers the key',
    required: false,
  })
  @IsOptional()
  @IsString()
  roomKey?: string;

  @ApiProperty({
    description: 'Legacy field, ignored; the backend discovers the SFU',
    required: false,
  })
  @IsOptional()
  @IsString()
  sfuUrl?: string;
}
