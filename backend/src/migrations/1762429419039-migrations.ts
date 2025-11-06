import { MigrationInterface, QueryRunner } from 'typeorm';

export class Migrations1762429419039 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Ajout de la colonne "likes"
    await queryRunner.query(`
          ALTER TABLE "comment_entity"
          ADD COLUMN "likes" integer NOT NULL DEFAULT 0;
        `);

    // Création de la table de relation user <-> comment pour les likes
    await queryRunner.query(`
          CREATE TABLE "user_liked_videos" (
            "user_id" uuid NOT NULL,
            "comment_id" uuid NOT NULL,
            CONSTRAINT "PK_user_liked_videos" PRIMARY KEY ("user_id", "comment_id"),
            CONSTRAINT "FK_user_liked_videos_user"
              FOREIGN KEY ("user_id") REFERENCES "user_entity"("id") ON DELETE CASCADE,
            CONSTRAINT "FK_user_liked_videos_comment"
              FOREIGN KEY ("comment_id") REFERENCES "comment_entity"("id") ON DELETE CASCADE
          );
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Suppression de la table de relation
    await queryRunner.query(`DROP TABLE "user_liked_videos";`);

    // Suppression de la colonne "likes"
    await queryRunner.query(`
          ALTER TABLE "comment_entity"
          DROP COLUMN "likes";
        `);
  }
}
