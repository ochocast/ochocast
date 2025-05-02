import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1743343074799 implements MigrationInterface {
  name = 'Migrations1743343074799';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "track_entity" ADD "startDate" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "track_entity" ADD "endDate" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "track_entity" DROP COLUMN "endDate"`);
    await queryRunner.query(
      `ALTER TABLE "track_entity" DROP COLUMN "startDate"`,
    );
  }
}
