import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  dropSearchSchema,
  ensureSearchSchema,
} from '../search/infra/schema/search-schema';

// Calls the shared `ensureSearchSchema`, which is append-only (see its comment):
// this migration has already run in production, so schema changes after it
// belong in a new migration, never in an edit of an existing statement.
export class AddContentSearch1794470400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await ensureSearchSchema(runner);
  }

  async down(runner: QueryRunner): Promise<void> {
    await dropSearchSchema(runner);
  }
}
