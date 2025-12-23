import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export interface ReactionDto {
  emoji: string;
  count: number;
  userIds: string[];
}

export class ChatMessageDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsUUID()
  @IsNotEmpty()
  trackId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  timestamp: Date;

  @IsOptional()
  editedAt?: Date | null;

  @IsOptional()
  reactions?: ReactionDto[];
}
