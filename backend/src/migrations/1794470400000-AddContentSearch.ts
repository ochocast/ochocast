import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  dropSearchSchema,
  ensureSearchSchema,
} from '../search/infra/schema/search-schema';

export class AddContentSearch1794470400000 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await ensureSearchSchema(runner);
  }

  async down(runner: QueryRunner): Promise<void> {
    await dropSearchSchema(runner);
  }
}
