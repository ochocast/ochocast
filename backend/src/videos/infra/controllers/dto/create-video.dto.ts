import { IsNotEmpty } from 'class-validator';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class CreateVideoDto {
  @IsNotEmpty()
  media_id: string;

  miniature_id: string;

  subtitle_id?: string;

  @IsNotEmpty()
  title: string;

  description: string;

  tags: TagEntity[];

  @IsNotEmpty()
  creator: UserEntity;

  internal_speakers: UserEntity[];

  external_speakers: string;

  comments: CommentEntity[];

  archived: boolean;
}
