import { MigrationInterface, QueryRunner } from "typeorm";

export class Migrations1716298594594 implements MigrationInterface {
    name = 'Migrations1716298594594'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "comment_entity" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "video" character varying NOT NULL, "content" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL, "updatedAt" TIMESTAMP NOT NULL, "creatorId" uuid, CONSTRAINT "PK_5a439a16c76d63e046765cdb84f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "comment_entity" ADD CONSTRAINT "FK_ddbcec18aa332aae8ce1db91bd2" FOREIGN KEY ("creatorId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "comment_entity" DROP CONSTRAINT "FK_ddbcec18aa332aae8ce1db91bd2"`);
        await queryRunner.query(`DROP TABLE "comment_entity"`);
    }

}
