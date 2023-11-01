import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1698346559324 implements MigrationInterface {
  name = 'Migrations1698346559324';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "track_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying NOT NULL, "keywords" text array NOT NULL, "streamKey" character varying NOT NULL, "closed" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL, "eventId" uuid, CONSTRAINT "PK_9cc0e8a743e689434dac0130098" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "event_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying NOT NULL, "category" character varying NOT NULL, "tags" text array NOT NULL, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "published" boolean NOT NULL, "isPrivate" boolean NOT NULL, "closed" boolean NOT NULL, "imageSlug" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "creatorId" uuid, CONSTRAINT "PK_c5675e66b601bd4d0882054a430" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "email" character varying NOT NULL, "role" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, CONSTRAINT "UQ_415c35b9b3b6fe45a3b065030f5" UNIQUE ("email"), CONSTRAINT "PK_b54f8ea623b17094db7667d8206" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "track_entity" ADD CONSTRAINT "FK_f1308848a9fa6de1cbdf126d481" FOREIGN KEY ("eventId") REFERENCES "event_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_entity" ADD CONSTRAINT "FK_231f5952ff53137afece03849eb" FOREIGN KEY ("creatorId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "event_entity" DROP CONSTRAINT "FK_231f5952ff53137afece03849eb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "track_entity" DROP CONSTRAINT "FK_f1308848a9fa6de1cbdf126d481"`,
    );
    await queryRunner.query(`DROP TABLE "user_entity"`);
    await queryRunner.query(`DROP TABLE "event_entity"`);
    await queryRunner.query(`DROP TABLE "track_entity"`);
  }
}
