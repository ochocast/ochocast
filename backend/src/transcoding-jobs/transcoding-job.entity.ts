import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import {
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../queue/job.types';
import { VideoEntity } from '../videos/infra/gateways/entities/video.entity';

@Entity('transcoding_job')
export class TranscodingJobEntity {
  @PrimaryColumn('uuid')
  id: string;

  @Index('IDX_transcoding_job_video')
  @Column('uuid')
  videoId: string;

  @ManyToOne(() => VideoEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'videoId' })
  video: VideoEntity;

  @Column('jsonb')
  payload: VideoTranscodingJob;

  @Column({ default: 'pending' })
  status: 'pending' | 'processing' | 'ready' | 'failed';

  @Column({ type: 'uuid', nullable: true })
  leaseToken: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  leaseExpiresAt: Date | null;

  @Column({ default: 0 })
  attempts: number;

  @Column({ type: 'jsonb', nullable: true })
  result: VideoTranscodingResult | null;
}
