import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1726233209426 implements MigrationInterface {
    name = ' $npmConfigName1726233209426'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "video_entity" ADD "archived" boolean NOT NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "video_entity" DROP COLUMN "archived"`);
    }

}
