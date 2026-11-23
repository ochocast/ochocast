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

  // Ignored: the vote is cast as the signed-in user. Kept so older clients that still
  // send it are not refused.
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}
