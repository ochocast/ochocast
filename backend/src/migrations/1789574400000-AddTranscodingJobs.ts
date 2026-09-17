import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTranscodingJobs1789574400000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "transcoding_job" (
      "id" uuid PRIMARY KEY,
      "videoId" uuid NOT NULL REFERENCES "video_entity"("id") ON DELETE CASCADE,
      "payload" jsonb NOT NULL,
      "status" varchar NOT NULL DEFAULT 'pending',
      "leaseToken" uuid,
      "leaseExpiresAt" timestamptz,
      "attempts" integer NOT NULL DEFAULT 0,
      "result" jsonb
    )`);
    await queryRunner.query(
      'CREATE INDEX "IDX_transcoding_job_video" ON "transcoding_job" ("videoId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "transcoding_job"');
  }
}
