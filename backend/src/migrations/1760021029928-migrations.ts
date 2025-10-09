import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1760021029928 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comment_entity" ADD COLUMN "parentid" uuid`,
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comment_entity" DROP COLUMN "parentid"`,
    );
  }
}
