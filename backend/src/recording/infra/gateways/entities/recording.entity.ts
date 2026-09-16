import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { TrackEntity } from '../../../../tracks/infra/gateways/entities/track.entity';
import { RecordingVisibility } from '../../../domain/recording';

/**
 * A recording segment of a track, persisted as `unlisted` on capture.
 * See {@link RecordingObject} for the domain semantics.
 */
@Entity()
export class RecordingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => TrackEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trackId' })
  track: TrackEntity;

  @Column()
  trackId: string;

  @Column()
  media_id: string;

  @Column({ default: 'unlisted' })
  visibility: RecordingVisibility;

  @Column({ default: false })
  problematic: boolean;

  @Column({ type: 'int', default: 0 })
  segment_index: number;

  @Column({ type: 'float', nullable: true })
  duration: number | null;

  @CreateDateColumn()
  createdAt: Date;

  constructor(recording: Partial<RecordingEntity>) {
    Object.assign(this, recording);
  }
}
