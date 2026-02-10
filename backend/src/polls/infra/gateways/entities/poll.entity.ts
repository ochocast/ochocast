import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TrackEntity } from '../../../../tracks/infra/gateways/entities/track.entity';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';
import { PollVoteEntity } from './poll-vote.entity';

@Entity('polls')
export class PollEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  question: string;

  @Column('text', { array: true })
  responses: string[];

  @Column({ default: 'active' })
  status: 'active' | 'closed' | 'archived' = 'active';

  @Column()
  duration: number; // in seconds

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;

  @ManyToOne(() => TrackEntity, { onDelete: 'CASCADE' })
  track: TrackEntity;

  @Column()
  trackId: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  createdBy: UserEntity;

  @Column()
  createdById: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => PollVoteEntity, (vote) => vote.poll, { cascade: true })
  votes: PollVoteEntity[];
}
