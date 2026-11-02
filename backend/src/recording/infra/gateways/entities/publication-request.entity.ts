import {
  Entity,
  Column,
  PrimaryColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { RecordingEntity } from './recording.entity';
import { TrackEntity } from '../../../../tracks/infra/gateways/entities/track.entity';
import { UserEntity } from '../../../../users/infra/gateways/entities/user.entity';
import {
  PublicationRequestMetadata,
  PublicationRequestStatus,
} from '../../../domain/publicationRequest';

/** US-6 — See {@link PublicationRequestObject}. */
@Entity()
export class PublicationRequestEntity {
  @PrimaryColumn('uuid')
  id: string;

  @ManyToOne(() => RecordingEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recordingId' })
  recording: RecordingEntity;

  @Column('uuid')
  recordingId: string;

  @ManyToOne(() => TrackEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trackId' })
  track: TrackEntity;

  @Column('uuid')
  trackId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requesterId' })
  requester: UserEntity;

  @Column('uuid')
  requesterId: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'targetUserId' })
  target: UserEntity;

  @Column('uuid')
  targetUserId: string;

  @Column({ default: 'pending' })
  status: PublicationRequestStatus;

  @Column()
  title: string;

  @Column('jsonb')
  metadata: PublicationRequestMetadata;

  @Column({ type: 'text', nullable: true })
  refusalReason: string | null;

  @Column({ type: 'uuid', nullable: true })
  videoId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  decidedAt: Date | null;

  constructor(request: Partial<PublicationRequestEntity>) {
    Object.assign(this, request);
  }
}
