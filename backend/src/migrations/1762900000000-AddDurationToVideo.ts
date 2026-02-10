import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDurationToVideo1762900000000 implements MigrationInterface {
  name = 'AddDurationToVideo1762900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_entity" ADD COLUMN "duration" double precision NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_entity" DROP COLUMN "duration"`,
    );
  }
}
