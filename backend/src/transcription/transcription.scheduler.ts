import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Interval, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { TranscriptionService } from './transcription.service';

@Injectable()
export class TranscriptionScheduler implements OnModuleInit {
  private readonly logger = new Logger(TranscriptionScheduler.name);

  constructor(
    private readonly service: TranscriptionService,
    private readonly registry: SchedulerRegistry,
  ) {}

  onModuleInit() {
    if (!this.service.enabled) return;
    const job = new CronJob(
      process.env.TRANSCRIPTION_CRON || '0 2 * * *',
      () => void this.service.run().catch((error) => this.logger.error(error.message)),
      null,
      false,
      process.env.TRANSCRIPTION_TIMEZONE || 'Europe/Paris',
    );
    this.registry.addCronJob('automatic-transcription', job);
    job.start();
  }

  // A crashed backend can leave the VM running. The durable marker and the
  // same PostgreSQL lock let any replica safely stop it after recovery.
  @Interval(60_000)
  async recoverWorker() {
    if (!this.service.enabled) return;
    try {
      await this.service.recover();
    } catch (error) {
      this.logger.error(`Transcription worker recovery failed: ${error.message}`);
    }
  }
}
