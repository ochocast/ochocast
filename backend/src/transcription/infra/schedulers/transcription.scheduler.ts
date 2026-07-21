import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OrchestrateTranscriptionUsecase } from '../../domain/usecases/orchestrateTranscription.usecase';

@Injectable()
export class TranscriptionScheduler {
  private readonly logger = new Logger(TranscriptionScheduler.name);

  constructor(private readonly orchestrate: OrchestrateTranscriptionUsecase) {}

  @Cron(process.env.TRANSCRIPTION_CRON || '0 2 * * *')
  async runNightlyBatch(): Promise<void> {
    this.logger.log('Nightly transcription batch triggered');
    await this.orchestrate.execute();
  }
}
