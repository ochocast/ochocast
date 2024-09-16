import { Entity, Column, PrimaryGeneratedColumn, OneToMany, ManyToMany } from 'typeorm';
import { EventEntity } from '../../../../events/infra/gateways/entities/event.entity';
import { CommentEntity } from '../../../../comments/infra/gateways/entities/comment.entity';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';

@Entity()
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  firstName: string;

  @Column()
  lastName: string;

  @Column({ unique: true })
  email: string;

  @Column()
  role: string;

  @Column({
    nullable: true
  })
  description: string;

  @OneToMany(() => EventEntity, (event) => event.creator, { cascade: true })
  events: EventEntity[];

  @OneToMany(() => CommentEntity, (comment) => comment.creator, { cascade: true })
  comments: CommentEntity[];

  @OneToMany(() => VideoEntity, (video) => video.creator, { cascade: true })
  videos: VideoEntity[]

  @Column()
  createdAt: Date;

  constructor(user: Partial<UserEntity>) {
    Object.assign(this, user);
  }
}
