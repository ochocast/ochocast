import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddVideoEditAnalysis1795000000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE video_edit_analysis_job (
      id uuid PRIMARY KEY, "videoId" uuid NOT NULL REFERENCES video_entity(id) ON DELETE CASCADE,
      "requestedBy" uuid NOT NULL, fingerprint varchar NOT NULL, payload jsonb NOT NULL,
      status varchar NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','failed')),
      phase varchar NOT NULL DEFAULT 'queued', "processedSeconds" double precision NOT NULL DEFAULT 0,
      attempts integer NOT NULL DEFAULT 0, "leaseToken" uuid, "leaseExpiresAt" timestamptz,
      "publishedAt" timestamptz, "nextDispatchAt" timestamptz NOT NULL,
      "expiresAt" timestamptz, result jsonb,
      "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(
      `CREATE UNIQUE INDEX "IDX_analysis_one_active_video" ON video_edit_analysis_job ("videoId") WHERE status IN ('pending','processing')`,
    );
    await runner.query(
      `CREATE INDEX "IDX_analysis_cache" ON video_edit_analysis_job ("videoId",fingerprint)`,
    );
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE video_edit_analysis_job');
  }
}
