import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1762429436492 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          ALTER TABLE "user_entity"
          ADD COLUMN "username" varchar;
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
          ALTER TABLE "user_entity"
          DROP COLUMN "username";
        `);
  }
}
