import { IsNotEmpty, IsOptional } from 'class-validator';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';

export class CreateCommentDto {
  @IsNotEmpty()
  creator: UserEntity;

  @IsNotEmpty()
  content: string;

  @IsNotEmpty()
  video: VideoEntity;

  @IsOptional()
  parentid?: string | null;
}
