import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { TrackEntity } from '../../../../tracks/infra/gateways/entities/track.entity';
import { RecordingErrorKind } from '../../../domain/gateways/recording-error.gateway';

/**
 * Last recorder failure of a track (at most one row per track). Kept out of
 * `track_entity` because tracks are exposed by a public endpoint.
 */
@Entity()
export class RecordingErrorEntity {
  @PrimaryColumn('uuid')
  trackId: string;

  @ManyToOne(() => TrackEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trackId' })
  track: TrackEntity;

  @Column()
  kind: RecordingErrorKind;

  @Column()
  occurredAt: Date;

  constructor(error: Partial<RecordingErrorEntity>) {
    Object.assign(this, error);
  }
}
