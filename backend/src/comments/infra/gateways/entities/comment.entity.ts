import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';

@Entity()
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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

  constructor(comment: Partial<CommentEntity>) {
    Object.assign(this, comment);
  }
}
