import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class ChatMessageDto {
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
}
