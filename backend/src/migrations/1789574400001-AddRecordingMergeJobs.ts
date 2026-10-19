import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordingMergeJobs1789574400001 implements MigrationInterface {
  name = 'AddRecordingMergeJobs1789574400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "recording_merge_job" (
        "id" uuid NOT NULL,
        "recordingId" uuid NOT NULL,
        "payload" jsonb NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending',
        "leaseToken" uuid,
        "leaseExpiresAt" TIMESTAMPTZ,
        "attempts" integer NOT NULL DEFAULT 0,
        "result" jsonb,
        CONSTRAINT "PK_recording_merge_job" PRIMARY KEY ("id"),
        CONSTRAINT "FK_recording_merge_job_recording" FOREIGN KEY ("recordingId")
          REFERENCES "recording_entity"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_recording_merge_job_recording" ON "recording_merge_job" ("recordingId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "recording_merge_job"`);
  }
}
