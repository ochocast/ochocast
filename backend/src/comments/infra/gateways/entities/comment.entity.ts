import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  ManyToMany,
} from 'typeorm';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';

@Entity()
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  parentid?: string | null;

  @ManyToOne(() => UserEntity, (user) => user.comments)
  creator: UserEntity;

  @ManyToOne(() => VideoEntity, (video) => video.comments)
  video: VideoEntity;

  @Column()
  content: string;

  @Column()
  createdAt: Date;

  @Column()
  updatedAt: Date;

  @Column({ default: 0 })
  likes: number;

  @ManyToMany(() => UserEntity, (user) => user.likedComments)
  usersWhoLiked: UserEntity[];

  constructor(comment: Partial<CommentEntity>) {
    Object.assign(this, comment);
  }
}
