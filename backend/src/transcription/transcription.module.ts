import { Module } from '@nestjs/common';
import { TranscriptionScheduler } from './infra/schedulers/transcription.scheduler';
import { OrchestrateTranscriptionUsecase } from './domain/usecases/orchestrateTranscription.usecase';
import { VideosModule } from 'src/videos/videos.module';
import { S3Module } from 'src/s3.module';

@Module({
  imports: [VideosModule, S3Module],
  providers: [OrchestrateTranscriptionUsecase, TranscriptionScheduler],
})
export class TranscriptionModule {}
