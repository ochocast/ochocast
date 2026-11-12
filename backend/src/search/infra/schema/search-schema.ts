import { DataSource, QueryRunner } from 'typeorm';

/**
 * Content search schema (design section 6.2).
 *
 * These tables are deliberately not TypeORM entities: `synchronize` must not
 * touch generated tsvector columns or text search configurations. The SQL is
 * idempotent so that the same function serves the production migration, the
 * development bootstrap (`SearchModule`) and the integration tests.
 *
 * Rule: `ensureSearchSchema` is append-only. Never edit or remove an existing
 * statement. Add new objects with `IF NOT EXISTS` (or a guarded `DO` block),
 * and never make them depend on anything created by a later migration. Every
 * addition ships in a NEW migration (which may call `ensureSearchSchema`
 * again): AddContentSearch has already run on staging and production and will
 * not run again.
 */
export async function ensureSearchSchema(
  db: DataSource | QueryRunner,
): Promise<void> {
  await db.query('CREATE EXTENSION IF NOT EXISTS unaccent');

  // French: elision, stop words, Snowball stemming, accents ignored.
  await db.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'ochocast_fr') THEN
      CREATE TEXT SEARCH CONFIGURATION ochocast_fr (COPY = french);
      ALTER TEXT SEARCH CONFIGURATION ochocast_fr
        ALTER MAPPING FOR hword, hword_part, word WITH unaccent, french_stem;
    END IF;
  END $$`);

  // Exact form (no stemming), accents ignored: proper nouns, acronyms.
  await db.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'ochocast_exact') THEN
      CREATE TEXT SEARCH CONFIGURATION ochocast_exact (COPY = simple);
      ALTER TEXT SEARCH CONFIGURATION ochocast_exact
        ALTER MAPPING FOR hword, hword_part, word WITH unaccent, simple;
    END IF;
  END $$`);

  // One row per indexed video: indexing state and full text.
  await db.query(`CREATE TABLE IF NOT EXISTS video_transcript (
    video_id      uuid PRIMARY KEY REFERENCES video_entity(id) ON DELETE CASCADE,
    subtitle_key  varchar NOT NULL,
    source        varchar NOT NULL,
    language      varchar(8) NOT NULL DEFAULT 'fr',
    segment_count integer NOT NULL,
    tsv_fr        tsvector NOT NULL,
    tsv_exact     tsvector NOT NULL,
    indexed_at    timestamptz NOT NULL DEFAULT now()
  )`);

  // One row per subtitle cue.
  await db.query(`CREATE TABLE IF NOT EXISTS video_transcript_segment (
    video_id  uuid NOT NULL REFERENCES video_entity(id) ON DELETE CASCADE,
    position  integer NOT NULL,
    start_s   real NOT NULL,
    end_s     real NOT NULL,
    text      text NOT NULL,
    tsv_fr    tsvector GENERATED ALWAYS AS (to_tsvector('ochocast_fr', text)) STORED,
    tsv_exact tsvector GENERATED ALWAYS AS (to_tsvector('ochocast_exact', text)) STORED,
    PRIMARY KEY (video_id, position)
  )`);
  await db.query(
    'CREATE INDEX IF NOT EXISTS idx_vts_tsv_fr ON video_transcript_segment USING gin (tsv_fr)',
  );
}

/** Drops both tables and both configurations, but not the `unaccent` extension. */
export async function dropSearchSchema(
  db: DataSource | QueryRunner,
): Promise<void> {
  await db.query('DROP TABLE IF EXISTS video_transcript_segment');
  await db.query('DROP TABLE IF EXISTS video_transcript');
  await db.query('DROP TEXT SEARCH CONFIGURATION IF EXISTS ochocast_fr');
  await db.query('DROP TEXT SEARCH CONFIGURATION IF EXISTS ochocast_exact');
}
