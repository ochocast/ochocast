import { IsNotEmpty } from 'class-validator';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class CreateVideoDto {
  @IsNotEmpty()
  media_id: string;

  @IsNotEmpty()
  title: string;

  @IsNotEmpty()
  description: string;

  @IsNotEmpty()
  tags: TagEntity[];
  
  @IsNotEmpty()
  creator: UserEntity;

  @IsNotEmpty()
  internal_speakers: string;

  @IsNotEmpty()
  external_speakers: string;

  @IsNotEmpty()
  comments: CommentEntity[];
}
