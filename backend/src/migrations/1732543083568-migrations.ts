import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1732543083568 implements MigrationInterface {
  name = 'Migrations1732543083568';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_entity" ADD "picture_id" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_entity" DROP COLUMN "picture_id"`,
    );
  }
}
