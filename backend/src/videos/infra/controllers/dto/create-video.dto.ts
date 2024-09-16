import { IsNotEmpty } from 'class-validator';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class CreateVideoDto {

  @IsNotEmpty()
  media_id: string;

  @IsNotEmpty()
  title: string;

  description: string;

  tags: TagEntity[];
  
  @IsNotEmpty()
  creator: string;

  internal_speakers: string;

  external_speakers: string;

  comments: CommentEntity[];

  archived: boolean;
}
