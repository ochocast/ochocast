import { MigrationInterface, QueryRunner } from "typeorm";

export class  $npmConfigName1715764423589 implements MigrationInterface {
    name = ' $npmConfigName1715764423589'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_entity" ADD "description" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_entity" DROP COLUMN "description"`);
    }

}
