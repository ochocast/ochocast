import {
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
  IsOptional,
  IsUUID,
  IsString,
} from 'class-validator';

export class VotePollDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  responseIndex: number;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
