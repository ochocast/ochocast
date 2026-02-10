import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1752330692336 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Supprimer l'ancienne colonne tags (text array)
    await queryRunner.query(`ALTER TABLE "event_entity" DROP COLUMN "tags"`);

    // Créer la table de jointure pour la relation ManyToMany entre event et tag
    await queryRunner.query(`
            CREATE TABLE "event_entity_tags_tag_entity" (
                "eventEntityId" uuid NOT NULL,
                "tagEntityId" uuid NOT NULL,
                CONSTRAINT "PK_event_tags" PRIMARY KEY ("eventEntityId", "tagEntityId")
            )
        `);

    // Créer les index pour améliorer les performances
    await queryRunner.query(
      `CREATE INDEX "IDX_event_entity_tags_event" ON "event_entity_tags_tag_entity" ("eventEntityId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_event_entity_tags_tag" ON "event_entity_tags_tag_entity" ("tagEntityId")`,
    );

    // Ajouter les contraintes de clés étrangères
    await queryRunner.query(`
            ALTER TABLE "event_entity_tags_tag_entity" 
            ADD CONSTRAINT "FK_event_entity_tags_event" 
            FOREIGN KEY ("eventEntityId") REFERENCES "event_entity"("id") 
            ON DELETE CASCADE ON UPDATE CASCADE
        `);

    await queryRunner.query(`
            ALTER TABLE "event_entity_tags_tag_entity" 
            ADD CONSTRAINT "FK_event_entity_tags_tag" 
            FOREIGN KEY ("tagEntityId") REFERENCES "tag_entity"("id") 
            ON DELETE CASCADE ON UPDATE CASCADE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Supprimer les contraintes de clés étrangères
    await queryRunner.query(
      `ALTER TABLE "event_entity_tags_tag_entity" DROP CONSTRAINT "FK_event_entity_tags_tag"`,
    );
    await queryRunner.query(
      `ALTER TABLE "event_entity_tags_tag_entity" DROP CONSTRAINT "FK_event_entity_tags_event"`,
    );

    // Supprimer les index
    await queryRunner.query(`DROP INDEX "IDX_event_entity_tags_tag"`);
    await queryRunner.query(`DROP INDEX "IDX_event_entity_tags_event"`);

    // Supprimer la table de jointure
    await queryRunner.query(`DROP TABLE "event_entity_tags_tag_entity"`);

    // Recréer l'ancienne colonne tags comme text array
    await queryRunner.query(
      `ALTER TABLE "event_entity" ADD "tags" text array NOT NULL DEFAULT '{}'`,
    );
  }
}
