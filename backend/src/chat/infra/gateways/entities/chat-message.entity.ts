import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  CreateDateColumn,
} from 'typeorm';
import { TrackEntity } from '../../../../tracks/infra/gateways/entities/track.entity';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';

@Entity('chat_messages')
export class ChatMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  message: string;

  @Column()
  userId: string;

  @Column()
  username: string;

  @CreateDateColumn()
  timestamp: Date;

  @ManyToOne(() => TrackEntity, { onDelete: 'CASCADE' })
  track: TrackEntity;

  @Column()
  trackId: string;

  @ManyToOne(() => UserEntity, { nullable: true })
  user: UserEntity;

  @Column({ type: 'timestamp', nullable: true })
  editedAt: Date | null;
}
