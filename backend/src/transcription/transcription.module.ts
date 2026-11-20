import { Module } from '@nestjs/common';
import { S3Module } from '../s3.module';
import { SearchModule } from '../search/search.module';
import { TranscriptionService } from './transcription.service';
import { TranscriptionScheduler } from './transcription.scheduler';

@Module({
  imports: [S3Module, SearchModule],
  providers: [TranscriptionService, TranscriptionScheduler],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
