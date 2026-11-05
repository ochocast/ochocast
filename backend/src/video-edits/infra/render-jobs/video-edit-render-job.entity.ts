import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { VideoEditEntity } from '../gateways/entities/video-edit.entity';
import {
  VideoEditRenderJob,
  VideoEditRenderResult,
} from '../../domain/videoEditRenderJob';

/** Same lease model as `recording_merge_job`, for montage renders. */
@Entity('video_edit_render_job')
export class VideoEditRenderJobEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Index('IDX_video_edit_render_job_edit')
  @Column('uuid')
  editId: string;

  @ManyToOne(() => VideoEditEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'editId' })
  edit: VideoEditEntity;

  @Column('integer')
  version: number;

  @Column('jsonb')
  payload: VideoEditRenderJob;

  @Column({ default: 'pending' })
  status: 'pending' | 'processing' | 'ready' | 'failed';

  @Column({ type: 'uuid', nullable: true })
  leaseToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'jsonb', nullable: true })
  result: VideoEditRenderResult | null;

  /** Set once the files of a render nobody plays any more are deleted. */
  @Column({ type: 'timestamptz', nullable: true })
  files_deleted_at: Date | null;
}
