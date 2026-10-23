import { IsIn, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LiveEventType } from '../../../domain/usecases/handleLiveEvent.usecase';

export class LiveEventDto {
  @ApiProperty({ description: 'SFU room id (== trackId)' })
  @IsUUID()
  roomId: string;

  @ApiProperty({ enum: ['started', 'stopped'] })
  @IsIn(['started', 'stopped'])
  event: LiveEventType;
}
