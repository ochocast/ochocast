import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  SegmentInput,
  TEXT_COLORS,
  TEXT_POSITIONS,
  TextColor,
  TextLayerInput,
  TextPosition,
  VIDEO_EDIT_LIMITS,
} from '../../../domain/videoEdit';

// Shape and types only: bounds against the video and its segments are
// checked by the use case (videoEditRules), which knows the duration.

export class TextLayerDto implements TextLayerInput {
  @ApiProperty({ example: 'Partie 2 : démonstration', maxLength: 500 })
  @IsString()
  @Length(1, VIDEO_EDIT_LIMITS.maxTextLength)
  content: string;

  @ApiProperty({ enum: TEXT_POSITIONS, example: 'bottom' })
  @IsIn(TEXT_POSITIONS)
  position: TextPosition;

  @ApiProperty({ enum: TEXT_COLORS, example: 'white' })
  @IsIn(TEXT_COLORS)
  color: TextColor;

  @ApiProperty({ example: 0, description: 'Seconds from its segment start.' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  startOffset: number;

  @ApiProperty({ example: 300, description: 'Seconds.' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @IsPositive()
  duration: number;
}

export class SegmentDto implements SegmentInput {
  @ApiProperty({ example: 120, description: 'Seconds in the source video.' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  sourceStart: number;

  @ApiProperty({ example: 870, description: 'Seconds in the source video.' })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  sourceEnd: number;

  @ApiProperty({ type: [TextLayerDto], required: false, maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(VIDEO_EDIT_LIMITS.maxTextLayersPerSegment)
  @ValidateNested({ each: true })
  @Type(() => TextLayerDto)
  textLayers: TextLayerDto[] = [];
}

export class SaveVideoEditDto {
  @ApiProperty({
    example: 1,
    description: 'Version read with GET; a stale version answers 409.',
  })
  @IsInt()
  @Min(1)
  version: number;

  @ApiProperty({
    type: [SegmentDto],
    description: 'Every segment, in playback order (1 to 100).',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(VIDEO_EDIT_LIMITS.maxSegments)
  @ValidateNested({ each: true })
  @Type(() => SegmentDto)
  segments: SegmentDto[];
}
