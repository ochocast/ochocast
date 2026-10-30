import { Module } from '@nestjs/common';
import { S3Module } from '../s3.module';
import { TranscriptionService } from './transcription.service';
import { TranscriptionScheduler } from './transcription.scheduler';

@Module({
  imports: [S3Module],
  providers: [TranscriptionService, TranscriptionScheduler],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
