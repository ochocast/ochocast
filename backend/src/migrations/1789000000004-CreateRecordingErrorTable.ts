import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRecordingErrorTable1789000000004 implements MigrationInterface {
  name = 'CreateRecordingErrorTable1789000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "recording_error_entity" (
        "trackId" uuid NOT NULL,
        "kind" varchar NOT NULL,
        "occurredAt" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_recording_error_track" PRIMARY KEY ("trackId"),
        CONSTRAINT "FK_recording_error_track" FOREIGN KEY ("trackId")
          REFERENCES "track_entity"("id") ON DELETE CASCADE
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "recording_error_entity"`);
  }
}
