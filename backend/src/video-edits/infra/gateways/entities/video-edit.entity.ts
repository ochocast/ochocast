import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';
import { RenderStatus } from '../../../domain/videoEdit';
import { VideoEditSegmentEntity } from './video-edit-segment.entity';

/** The montage of a video. The source video row and file are never changed. */
@Entity('video_edit')
export class VideoEditEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  videoId: string;

  @OneToOne(() => VideoEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'videoId' })
  video: VideoEntity;

  @Column({ default: 'draft' })
  render_status: RenderStatus;

  @Column({ type: 'text', nullable: true })
  render_error: string | null;

  @Column({ type: 'varchar', nullable: true })
  rendered_media_id: string | null;

  /** Seconds of the rendered version viewers get. */
  @Column({ type: 'double precision', nullable: true })
  rendered_duration: number | null;

  // Bumped by hand on each write, inside the row lock (optimistic locking).
  @Column({ type: 'integer', default: 1 })
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => VideoEditSegmentEntity, (segment) => segment.edit)
  segments: VideoEditSegmentEntity[];
}
