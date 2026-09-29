import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePublicationRequestTable1789000000005 implements MigrationInterface {
  name = 'CreatePublicationRequestTable1789000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "publication_request_entity" (
        "id" uuid NOT NULL,
        "recordingId" uuid NOT NULL,
        "trackId" uuid NOT NULL,
        "requesterId" uuid NOT NULL,
        "targetUserId" uuid NOT NULL,
        "status" varchar NOT NULL DEFAULT 'pending',
        "title" varchar NOT NULL,
        "metadata" jsonb NOT NULL,
        "refusalReason" text,
        "videoId" uuid,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "decidedAt" TIMESTAMP,
        CONSTRAINT "PK_publication_request" PRIMARY KEY ("id"),
        CONSTRAINT "FK_publication_request_recording" FOREIGN KEY ("recordingId")
          REFERENCES "recording_entity"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_publication_request_track" FOREIGN KEY ("trackId")
          REFERENCES "track_entity"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_publication_request_requester" FOREIGN KEY ("requesterId")
          REFERENCES "user_entity"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_publication_request_target" FOREIGN KEY ("targetUserId")
          REFERENCES "user_entity"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_publication_request_target_status" ON "publication_request_entity" ("targetUserId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_publication_request_track" ON "publication_request_entity" ("trackId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "publication_request_entity"`,
    );
  }
}
