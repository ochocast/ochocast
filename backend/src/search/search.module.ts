import { Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ensureSearchSchema } from './infra/schema/search-schema';

@Module({})
export class SearchModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    // Same condition as `synchronize` in config/database.config.ts: the
    // search tables are not entities, so nothing else creates them there.
    // Production creates them through the AddContentSearch migration.
    if (process.env.NODE_ENV === 'development') {
      await ensureSearchSchema(this.dataSource);
    }
  }
}
