import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { PollEntity } from './poll.entity';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';

@Entity('poll_votes')
export class PollVoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => PollEntity, (poll) => poll.votes, { onDelete: 'CASCADE' })
  poll: PollEntity;

  @Column()
  pollId: string;

  @Column()
  responseIndex: number;

  @ManyToOne(() => UserEntity, { nullable: true })
  user: UserEntity;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  sessionId: string;

  @CreateDateColumn()
  createdAt: Date;
}
