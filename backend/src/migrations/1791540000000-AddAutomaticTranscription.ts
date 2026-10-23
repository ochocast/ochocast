import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutomaticTranscription1791540000000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE transcription_runtime (
      id integer PRIMARY KEY CHECK (id = 1), worker_requested boolean NOT NULL DEFAULT false)`);
    await runner.query('INSERT INTO transcription_runtime (id) VALUES (1)');
    await runner.query(`ALTER TABLE video_entity
      ADD audio_key varchar,
      ADD has_audio boolean,
      ADD transcription_status varchar NOT NULL DEFAULT 'waiting_audio',
      ADD transcription_error text,
      ADD transcription_attempts integer NOT NULL DEFAULT 0,
      ADD transcription_retry_at timestamptz`);
    await runner.query(`UPDATE video_entity SET transcription_status = 'ready'
      WHERE subtitle_id IS NOT NULL AND subtitle_id <> ''`);
    await runner.query(`CREATE INDEX "IDX_video_transcription_pending"
      ON video_entity (transcription_status, transcription_retry_at)
      WHERE archived = false AND (subtitle_id IS NULL OR subtitle_id = '')`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE transcription_runtime');
    await runner.query('DROP INDEX "IDX_video_transcription_pending"');
    await runner.query(`ALTER TABLE video_entity DROP audio_key, DROP has_audio,
      DROP transcription_status, DROP transcription_error,
      DROP transcription_attempts, DROP transcription_retry_at`);
  }
}
