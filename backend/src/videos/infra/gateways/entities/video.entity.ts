import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  ManyToMany,
} from 'typeorm';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';

@Entity()
export class VideoEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  media_id: string;

  @Column()
  miniature_id: string;

  @Column()
  title: string;

  @Column()
  description: string;

  @ManyToMany(() => TagEntity)
  tags: TagEntity[];

  @ManyToOne(() => UserEntity, (user) => user.videos)
  creator: string;

  @Column()
  createdAt: Date;

  @Column()
  updatedAt: Date;

  @Column()
  internal_speakers: string;

  @Column()
  external_speakers: string;

  @Column()
  views: number;

  @OneToMany(() => CommentEntity, (comment) => comment.video)
  comments: CommentEntity[];

  @Column()
  archived: boolean;

  constructor(video: Partial<VideoEntity>) {
    Object.assign(this, video);
  }
}
