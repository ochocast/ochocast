import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { RecordingEntity } from '../gateways/entities/recording.entity';
import {
  RecordingMergeJob,
  RecordingMergeResult,
} from '../../domain/recordingMergeJob';

/** Same lease model as `transcoding_job`, for montages (US-3). */
@Entity('recording_merge_job')
export class RecordingMergeJobEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Index('IDX_recording_merge_job_recording')
  @Column('uuid')
  recordingId: string;

  // "Go back" deletes the montage, which cascades to its job.
  @ManyToOne(() => RecordingEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recordingId' })
  recording: RecordingEntity;

  @Column('jsonb')
  payload: RecordingMergeJob;

  @Column({ default: 'pending' })
  status: 'pending' | 'processing' | 'ready' | 'failed';

  @Column({ type: 'uuid', nullable: true })
  leaseToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'jsonb', nullable: true })
  result: RecordingMergeResult | null;
}
