import { Module, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { S3Module } from '../s3.module';
import { ensureSearchSchema } from './infra/schema/search-schema';
import { TranscriptIndexer } from './infra/transcript-indexer';
import { UsersModule } from '../users/users.module';
import { SearchController } from './infra/controllers/search.controller';
import { PostgresSearchGateway } from './infra/postgres-search.gateway';
import { SearchVideosUsecase } from './domain/usecases/search-videos.usecase';

@Module({
  imports: [S3Module, UsersModule],
  controllers: [SearchController],
  providers: [
    TranscriptIndexer,
    { provide: 'SearchGateway', useClass: PostgresSearchGateway },
    SearchVideosUsecase,
  ],
  exports: [TranscriptIndexer],
})
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
