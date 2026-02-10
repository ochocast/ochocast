import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1752331344496 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "config_files" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "fileUrl" text NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_config_files" PRIMARY KEY ("id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "config_files"`);
  }
}
