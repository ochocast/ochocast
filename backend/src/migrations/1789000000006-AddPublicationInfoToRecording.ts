import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicationInfoToRecording1789000000006 implements MigrationInterface {
  name = 'AddPublicationInfoToRecording1789000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recording_entity" ADD COLUMN IF NOT EXISTS "published_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" ADD COLUMN IF NOT EXISTS "published_video_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" ADD COLUMN IF NOT EXISTS "published_by_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" ADD CONSTRAINT "FK_recording_published_by" FOREIGN KEY ("published_by_id") REFERENCES "user_entity"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recording_entity" DROP CONSTRAINT IF EXISTS "FK_recording_published_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" DROP COLUMN IF EXISTS "published_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" DROP COLUMN IF EXISTS "published_video_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recording_entity" DROP COLUMN IF EXISTS "published_at"`,
    );
  }
}
