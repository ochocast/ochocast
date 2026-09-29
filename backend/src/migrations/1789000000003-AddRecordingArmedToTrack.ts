import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecordingArmedToTrack1789000000003 implements MigrationInterface {
  name = 'AddRecordingArmedToTrack1789000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "track_entity" ADD COLUMN IF NOT EXISTS "recordingArmed" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "track_entity" DROP COLUMN IF EXISTS "recordingArmed"`,
    );
  }
}
