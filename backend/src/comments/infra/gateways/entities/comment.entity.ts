import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
//import { VideoEntity } from '../../../../events/infra/gateways/entities/event.entity';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';

@Entity()
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => UserEntity, (user) => user.comments)
  creator: UserEntity;

  @Column()
  video: string;

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
