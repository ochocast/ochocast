import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExpiresAtToPoll1764081112546 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "polls"
            ADD COLUMN "expiresAt" TIMESTAMP NULL
        `);

    // Populate expiresAt for existing polls based on createdAt + duration
    await queryRunner.query(`
            UPDATE "polls"
            SET "expiresAt" = "createdAt" + (duration || ' seconds')::INTERVAL
            WHERE "expiresAt" IS NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "polls"
            DROP COLUMN "expiresAt"
        `);
  }
}
