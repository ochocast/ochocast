import { MigrationInterface, QueryRunner } from 'typeorm';
export class VideoUploads1788950000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE video_upload (
      id uuid PRIMARY KEY, "ownerId" uuid NOT NULL, key varchar NOT NULL,
      "uploadId" varchar, size bigint NOT NULL, "partSize" integer NOT NULL,
      filename varchar NOT NULL, "checksumMode" varchar NOT NULL,
      state varchar NOT NULL DEFAULT 'uploading', checksums jsonb NOT NULL DEFAULT '{}',
      "expiresAt" timestamptz NOT NULL, "completedAt" timestamptz
    )`);
    await q.query(`CREATE INDEX video_upload_expired ON video_upload (state, "expiresAt")`);
  }
  async down(q: QueryRunner): Promise<void> { await q.query('DROP TABLE video_upload'); }
}
