import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1728293689439 implements MigrationInterface {
    name = ' $npmConfigName1728293689439'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "video_entity" ADD "miniature_id" character varying NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "video_entity" DROP COLUMN "miniature_id"`);
    }

}
