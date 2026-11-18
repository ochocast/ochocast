import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';
import { AnalysisJob, AnalysisResult } from '../../domain/videoEditAnalysis';
@Entity('video_edit_analysis_job')
@Index('IDX_analysis_one_active_video', ['videoId'], {
  unique: true,
  where: `status IN ('pending', 'processing')`,
})
@Index('IDX_analysis_cache', ['videoId', 'fingerprint'])
export class AnalysisJobEntity {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') videoId: string;
  @ManyToOne(() => VideoEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'videoId' })
  video: VideoEntity;
  @Column('uuid') requestedBy: string;
  @Column() fingerprint: string;
  @Column('jsonb') payload: AnalysisJob;
  @Column({ default: 'pending' }) status:
    | 'pending'
    | 'processing'
    | 'ready'
    | 'failed';
  @Column({ default: 'queued' }) phase:
    | 'queued'
    | 'downloading'
    | 'analyzing'
    | 'complete';
  @Column('double precision', { default: 0 }) processedSeconds: number;
  @Column('int', { default: 0 }) attempts: number;
  @Column('uuid', { nullable: true }) leaseToken: string | null;
  @Column('timestamptz', { nullable: true }) leaseExpiresAt: Date | null;
  @Column('timestamptz', { nullable: true }) publishedAt: Date | null;
  @Column('timestamptz') nextDispatchAt: Date;
  @Column('timestamptz', { nullable: true }) expiresAt: Date | null;
  @Column('jsonb', { nullable: true }) result: AnalysisResult | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
