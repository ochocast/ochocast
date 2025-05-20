import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1747139952500 implements MigrationInterface {
  name = 'Migrations1747139952500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "event_entity_users_subscribe_user_entity" ("eventEntityId" uuid NOT NULL, "userEntityId" uuid NOT NULL, CONSTRAINT "PK_139c9e1137ba64b9186f0fd8c8f" PRIMARY KEY ("eventEntityId", "userEntityId"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0cba108e2cca4cf38774613cfd" ON "event_entity_users_subscribe_user_entity" ("eventEntityId") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aa8e7796c9834e285632d725f4" ON "event_entity_users_subscribe_user_entity" ("userEntityId") `,
    );
    await queryRunner.query(
      `ALTER TABLE "event_entity_users_subscribe_user_entity" ADD CONSTRAINT "FK_0cba108e2cca4cf38774613cfd9" FOREIGN KEY ("eventEntityId") REFERENCES "event_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_entity_users_subscribe_user_entity" ADD CONSTRAINT "FK_aa8e7796c9834e285632d725f4d" FOREIGN KEY ("userEntityId") REFERENCES "user_entity"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "event_entity_users_subscribe_user_entity" DROP CONSTRAINT "FK_aa8e7796c9834e285632d725f4d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_entity_users_subscribe_user_entity" DROP CONSTRAINT "FK_0cba108e2cca4cf38774613cfd9"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aa8e7796c9834e285632d725f4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0cba108e2cca4cf38774613cfd"`,
    );
    await queryRunner.query(
      `DROP TABLE "event_entity_users_subscribe_user_entity"`,
    );
  }
}
