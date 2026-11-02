import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SetRecordingArmedDto {
  @ApiProperty({ description: 'Record every live of the track automatically' })
  @IsBoolean()
  armed: boolean;
}
