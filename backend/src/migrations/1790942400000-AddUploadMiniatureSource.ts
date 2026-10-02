import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUploadMiniatureSource1790942400000
  implements MigrationInterface
{
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "video_upload" ADD "miniatureSourceKey" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "video_upload" DROP COLUMN "miniatureSourceKey"',
    );
  }
}
