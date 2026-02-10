import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsNumber,
  Min,
  Max,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
} from 'class-validator';

export class CreatePollDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200, {
    message: 'La question ne peut pas dépasser 200 caractères',
  })
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, {
    each: true,
    message: 'Chaque réponse ne peut pas dépasser 100 caractères',
  })
  responses: string[];

  @IsNumber()
  @IsNotEmpty()
  @Min(60)
  @Max(600)
  duration: number; // in seconds

  @IsString()
  @IsNotEmpty()
  trackId: string;
}
