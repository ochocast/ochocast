import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1744967638086 implements MigrationInterface {
  name = 'Migrations1744967638086';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "event_entity" DROP COLUMN "category"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "event_entity" ADD "category" character varying NOT NULL`,
    );
  }
}
