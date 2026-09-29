import { Column, Entity, PrimaryColumn } from 'typeorm';
import { VideoTranscodingJob } from 'src/queue/job.types';

@Entity('video_upload')
export class VideoUpload {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') ownerId: string;
  @Column() key: string;
  @Column({ nullable: true }) uploadId: string;
  @Column('bigint') size: string;
  @Column('int') partSize: number;
  @Column() filename: string;
  @Column() checksumMode: string;
  @Column({ default: 'uploading' }) state: string;
  @Column('jsonb', { default: {} }) checksums: Record<string, string>;
  @Column('jsonb', { nullable: true }) job: VideoTranscodingJob;
  @Column('timestamptz') expiresAt: Date;
  @Column('timestamptz', { nullable: true }) publishedAt: Date;
  @Column('timestamptz', { nullable: true }) completedAt: Date;
}
