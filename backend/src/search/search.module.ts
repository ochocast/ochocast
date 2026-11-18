import { Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ensureSearchSchema } from './infra/schema/search-schema';

@Module({})
export class SearchModule implements OnModuleInit {
  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    // Design section 3: bootstrap only when `synchronize` is active, because the
    // search tables are not entities. Production uses the AddContentSearch migration.
    if (this.dataSource.options.synchronize) {
      await ensureSearchSchema(this.dataSource);
    }
  }
}
