import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ScheduleTranscriptionUsecase } from '../../domain/usecases/scheduleTranscription.usecase';
import { TranscriptionJob } from '../../domain/gateways/transcription.gateway';

@Injectable()
export class TranscriptionScheduler {
  private readonly logger = new Logger(TranscriptionScheduler.name);

  constructor(
    private readonly scheduleTranscription: ScheduleTranscriptionUsecase,
  ) {}

  // Tous les jours à 2h du matin
  @Cron('0 2 * * *')
  async runNightlyBatch(): Promise<void> {
    this.logger.log('Nightly transcription batch triggered');

    // TODO: remplacer par une vraie requête DB
    // SELECT * FROM videos WHERE vtt_url IS NULL
    const pendingJobs: TranscriptionJob[] = [];

    if (pendingJobs.length === 0) {
      this.logger.log('No videos to transcribe tonight');
      return;
    }

    await this.scheduleTranscription.execute(pendingJobs);
  }
}
