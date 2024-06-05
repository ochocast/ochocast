import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1717580453335 implements MigrationInterface {
    name = ' $npmConfigName1717580453335'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comment_entity" RENAME COLUMN "video" TO "videoId"`);
        await queryRunner.query(`CREATE TABLE "video_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "media_id" character varying NOT NULL, "title" character varying NOT NULL, "description" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL, "internal_speakers" character varying NOT NULL, "external_speakers" character varying NOT NULL, "views" integer NOT NULL, "creatorId" uuid, CONSTRAINT "PK_a86a8f20977e8900f5f6dc4add6" PRIMARY KEY ("id"))`);
        //await queryRunner.query(`CREATE TABLE "tag_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL, CONSTRAINT "PK_98efc66e2a1ce7fa1425e21e468" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "comment_entity" DROP COLUMN "videoId"`);
        await queryRunner.query(`ALTER TABLE "comment_entity" ADD "videoId" uuid`);
        await queryRunner.query(`ALTER TABLE "video_entity" ADD CONSTRAINT "FK_1a2213cf8fe67d86a296733c879" FOREIGN KEY ("creatorId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comment_entity" ADD CONSTRAINT "FK_7f04e30e6b47e3d95a48883f08c" FOREIGN KEY ("videoId") REFERENCES "video_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comment_entity" DROP CONSTRAINT "FK_7f04e30e6b47e3d95a48883f08c"`);
        await queryRunner.query(`ALTER TABLE "video_entity" DROP CONSTRAINT "FK_1a2213cf8fe67d86a296733c879"`);
        await queryRunner.query(`ALTER TABLE "comment_entity" DROP COLUMN "videoId"`);
        await queryRunner.query(`ALTER TABLE "comment_entity" ADD "videoId" character varying NOT NULL`);
        //await queryRunner.query(`DROP TABLE "tag_entity"`);
        await queryRunner.query(`DROP TABLE "video_entity"`);
        await queryRunner.query(`ALTER TABLE "comment_entity" RENAME COLUMN "videoId" TO "video"`);
    }

}
