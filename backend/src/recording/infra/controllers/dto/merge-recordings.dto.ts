import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class MergeRecordingsDto {
  @ApiProperty({
    description: 'Ids of the unlisted segments to merge (at least two).',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('all', { each: true })
  segmentIds: string[];
}
