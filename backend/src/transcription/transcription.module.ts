import { Module } from '@nestjs/common';
import { TranscriptionApiGateway } from './infra/gateways/transcription-api.gateway';
import { TranscriptionScheduler } from './infra/schedulers/transcription.scheduler';
import { ScheduleTranscriptionUsecase } from './domain/usecases/scheduleTranscription.usecase';

@Module({
  providers: [
    {
      provide: 'TranscriptionGateway',
      useClass: TranscriptionApiGateway,
    },
    ScheduleTranscriptionUsecase,
    TranscriptionScheduler,
  ],
  exports: [ScheduleTranscriptionUsecase],
})
export class TranscriptionModule {}
