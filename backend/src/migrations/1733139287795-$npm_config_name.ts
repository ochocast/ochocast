import { MigrationInterface, QueryRunner } from 'typeorm';

export class $npmConfigName1733139287795 implements MigrationInterface {
  name = '$npmConfigName1733139287795';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "video_entity_internal_speakers_user_entity" ("videoEntityId" uuid NOT NULL, "userEntityId" uuid NOT NULL, CONSTRAINT "PK_4b4618404779ddadfce97c0fd4c" PRIMARY KEY ("videoEntityId", "userEntityId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f0264082f0fc6316bf6bbcc400" ON "video_entity_internal_speakers_user_entity" ("videoEntityId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b650fa7cbdfbf0561fa33c2199" ON "video_entity_internal_speakers_user_entity" ("userEntityId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity" DROP COLUMN "internal_speakers"`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity_internal_speakers_user_entity" ADD CONSTRAINT "FK_f0264082f0fc6316bf6bbcc400c" FOREIGN KEY ("videoEntityId") REFERENCES "video_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity_internal_speakers_user_entity" ADD CONSTRAINT "FK_b650fa7cbdfbf0561fa33c21999" FOREIGN KEY ("userEntityId") REFERENCES "user_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "video_entity_internal_speakers_user_entity" DROP CONSTRAINT "FK_b650fa7cbdfbf0561fa33c21999"`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity_internal_speakers_user_entity" DROP CONSTRAINT "FK_f0264082f0fc6316bf6bbcc400c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "video_entity" ADD "internal_speakers" character varying NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b650fa7cbdfbf0561fa33c2199"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f0264082f0fc6316bf6bbcc400"`,
    );
    await queryRunner.query(
      `DROP TABLE "video_entity_internal_speakers_user_entity"`,
    );
  }
}
