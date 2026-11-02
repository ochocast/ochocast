import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Video editing (montage): one non-destructive edit per video. The source
 * video is never modified; segments point at times of the original file.
 */
export class CreateVideoEdits1793638092000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE "video_edit" (
      "id" uuid PRIMARY KEY,
      "videoId" uuid NOT NULL UNIQUE
        REFERENCES "video_entity"("id") ON DELETE CASCADE,
      "render_status" varchar NOT NULL DEFAULT 'draft'
        CHECK ("render_status" IN ('draft', 'pending', 'processing', 'ready', 'failed')),
      "render_error" text,
      "rendered_media_id" varchar,
      "version" integer NOT NULL DEFAULT 1 CHECK ("version" >= 1),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query(`CREATE TABLE "video_edit_segment" (
      "id" uuid PRIMARY KEY,
      "editId" uuid NOT NULL REFERENCES "video_edit"("id") ON DELETE CASCADE,
      "position" integer NOT NULL CHECK ("position" >= 0),
      "source_start" double precision NOT NULL CHECK ("source_start" >= 0),
      "source_end" double precision NOT NULL,
      CONSTRAINT "CHK_video_edit_segment_min_duration"
        CHECK ("source_end" - "source_start" >= 1),
      CONSTRAINT "UQ_video_edit_segment_position" UNIQUE ("editId", "position")
    )`);
    await runner.query(`CREATE TABLE "video_edit_text_layer" (
      "id" uuid PRIMARY KEY,
      "segmentId" uuid NOT NULL
        REFERENCES "video_edit_segment"("id") ON DELETE CASCADE,
      "content" text NOT NULL
        CHECK (char_length("content") BETWEEN 1 AND 500),
      "position" varchar NOT NULL DEFAULT 'bottom'
        CHECK ("position" IN ('top', 'center', 'bottom')),
      "color" varchar NOT NULL DEFAULT 'white'
        CHECK ("color" IN ('white', 'black', 'green')),
      "start_offset" double precision NOT NULL CHECK ("start_offset" >= 0),
      "duration" double precision NOT NULL CHECK ("duration" > 0)
    )`);
    await runner.query(
      'CREATE INDEX "IDX_video_edit_text_layer_segment" ON "video_edit_text_layer" ("segmentId")',
    );
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE "video_edit_text_layer"');
    await runner.query('DROP TABLE "video_edit_segment"');
    await runner.query('DROP TABLE "video_edit"');
  }
}
