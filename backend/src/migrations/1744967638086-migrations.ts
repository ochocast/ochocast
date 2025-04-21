import { MigrationInterface, QueryRunner } from "typeorm";

export class Migrations1744967638086 implements MigrationInterface {
    name = 'Migrations1744967638086'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name='event_entity' AND column_name='category'
                ) THEN
                    ALTER TABLE "event_entity" DROP COLUMN "category";
                END IF;
            END
            $$;
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1
                    FROM information_schema.columns
                    WHERE table_name='event_entity' AND column_name='category'
                ) THEN
                    ALTER TABLE "event_entity" ADD "category" character varying NOT NULL;
                END IF;
            END
            $$;
        `);
    }
}
