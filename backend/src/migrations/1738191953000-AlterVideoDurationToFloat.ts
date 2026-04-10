import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterVideoDurationToFloat1738191953000 implements MigrationInterface {
  name = 'AlterVideoDurationToFloat1738191953000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_entity" ALTER COLUMN "duration" TYPE double precision USING duration::double precision`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity" ALTER COLUMN "duration" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_entity" ALTER COLUMN "duration" TYPE integer USING duration::integer`,
    );
  }
}
