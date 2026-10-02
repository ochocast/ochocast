import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('video_upload')
export class VideoUpload {
  @PrimaryColumn('uuid') id: string;
  @Column('uuid') ownerId: string;
  @Column() key: string;
  @Column({ nullable: true }) uploadId: string;
  @Column('bigint') size: string;
  @Column('int') partSize: number;
  @Column() filename: string;
  @Column({ nullable: true }) miniatureSourceKey: string | null;
  @Column() checksumMode: string;
  @Column({ default: 'uploading' }) state: string;
  @Column('jsonb', { default: {} }) checksums: Record<string, string>;
  @Column('timestamptz') expiresAt: Date;
  @Column('timestamptz', { nullable: true }) completedAt: Date;
}
