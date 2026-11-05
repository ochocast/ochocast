import { MigrationInterface, QueryRunner } from 'typeorm';

/** Render jobs of montages, on the lease model of recording_merge_job. */
export class AddVideoEditRenderJobs1793891216000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "video_edit_render_job" (
      "id" uuid PRIMARY KEY,
      "editId" uuid NOT NULL REFERENCES "video_edit"("id") ON DELETE CASCADE,
      "version" integer NOT NULL,
      "payload" jsonb NOT NULL,
      "status" varchar NOT NULL DEFAULT 'pending'
        CHECK ("status" IN ('pending', 'processing', 'ready', 'failed')),
      "leaseToken" uuid,
      "leaseExpiresAt" timestamptz,
      "attempts" integer NOT NULL DEFAULT 0,
      "result" jsonb,
      "files_deleted_at" timestamptz
    )`);
    await runner.query(
      'CREATE INDEX "IDX_video_edit_render_job_edit" ON "video_edit_render_job" ("editId")',
    );
    await runner.query(
      'ALTER TABLE "video_edit" ADD "rendered_duration" double precision',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('ALTER TABLE "video_edit" DROP "rendered_duration"');
    await runner.query('DROP TABLE "video_edit_render_job"');
  }
}
