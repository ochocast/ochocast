import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVideoTranscodingStatus1781863200000 implements MigrationInterface {
  name = 'AddVideoTranscodingStatus1781863200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_entity" ADD "transcoding_status" character varying NOT NULL DEFAULT 'ready'`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity" ADD "transcoding_error" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_entity" DROP COLUMN "transcoding_error"`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity" DROP COLUMN "transcoding_status"`,
    );
  }
}
