import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations0727693178725 implements MigrationInterface {
  name = 'Migrations0727693178725';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "track_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying NOT NULL, "keywords" text array NOT NULL, "streamKey" character varying NOT NULL, "closed" boolean NOT NULL, "createdAt" TIMESTAMP NOT NULL, "eventId" uuid, CONSTRAINT "PK_9cc0e8a743e689434dac0130098" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "event_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "description" character varying NOT NULL, "category" character varying NOT NULL, "tags" text array NOT NULL, "startDate" TIMESTAMP NOT NULL, "endDate" TIMESTAMP NOT NULL, "published" boolean NOT NULL, "isPrivate" boolean NOT NULL, "closed" boolean NOT NULL, "imageSlug" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "creatorId" uuid, CONSTRAINT "PK_c5675e66b601bd4d0882054a430" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tag_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_98efc66e2a1ce7fa1425e21e468" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "video_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "media_id" character varying NOT NULL, "miniature_id" character varying NOT NULL, "title" character varying NOT NULL, "description" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL, "internal_speakers" character varying NOT NULL, "external_speakers" character varying NOT NULL, "views" integer NOT NULL, "archived" boolean NOT NULL, "creatorId" uuid, CONSTRAINT "PK_a86a8f20977e8900f5f6dc4add6" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "firstName" character varying NOT NULL, "lastName" character varying NOT NULL, "email" character varying NOT NULL, "role" character varying NOT NULL, "description" character varying, "createdAt" TIMESTAMP NOT NULL, CONSTRAINT "UQ_415c35b9b3b6fe45a3b065030f5" UNIQUE ("email"), CONSTRAINT "PK_b54f8ea623b17094db7667d8206" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "comment_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "content" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL, "creatorId" uuid, "videoId" uuid, CONSTRAINT "PK_5a439a16c76d63e046765cdb84f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "track_entity" ADD CONSTRAINT "FK_f1308848a9fa6de1cbdf126d481" FOREIGN KEY ("eventId") REFERENCES "event_entity"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_entity" ADD CONSTRAINT "FK_231f5952ff53137afece03849eb" FOREIGN KEY ("creatorId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity" ADD CONSTRAINT "FK_1a2213cf8fe67d86a296733c879" FOREIGN KEY ("creatorId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comment_entity" ADD CONSTRAINT "FK_ddbcec18aa332aae8ce1db91bd2" FOREIGN KEY ("creatorId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "comment_entity" ADD CONSTRAINT "FK_7f04e30e6b47e3d95a48883f08c" FOREIGN KEY ("videoId") REFERENCES "video_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "comment_entity" DROP CONSTRAINT "FK_7f04e30e6b47e3d95a48883f08c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "comment_entity" DROP CONSTRAINT "FK_ddbcec18aa332aae8ce1db91bd2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity" DROP CONSTRAINT "FK_1a2213cf8fe67d86a296733c879"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_entity" DROP CONSTRAINT "FK_231f5952ff53137afece03849eb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "track_entity" DROP CONSTRAINT "FK_f1308848a9fa6de1cbdf126d481"`,
    );
    await queryRunner.query(`DROP TABLE "comment_entity"`);
    await queryRunner.query(`DROP TABLE "user_entity"`);
    await queryRunner.query(`DROP TABLE "video_entity"`);
    await queryRunner.query(`DROP TABLE "tag_entity"`);
    await queryRunner.query(`DROP TABLE "event_entity"`);
    await queryRunner.query(`DROP TABLE "track_entity"`);
  }
  // UPDATE "track_entity" SET "startDate" = NOW(), "endDate" = NOW() WHERE "startDate" IS NULL;
}
