import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMergeFieldsToRecording1789000000002 implements MigrationInterface {
  name = 'AddMergeFieldsToRecording1789000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recording_entity" ADD COLUMN IF NOT EXISTS "kind" varchar NOT NULL DEFAULT 'segment'`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" ADD COLUMN IF NOT EXISTS "status" varchar NOT NULL DEFAULT 'ready'`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" ADD COLUMN IF NOT EXISTS "source_segment_ids" text[]`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recording_entity" DROP COLUMN IF EXISTS "source_segment_ids"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" DROP COLUMN IF EXISTS "status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" DROP COLUMN IF EXISTS "kind"`,
    );
  }
}
