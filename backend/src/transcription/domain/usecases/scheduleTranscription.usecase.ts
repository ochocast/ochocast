import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  ITranscriptionGateway,
  TranscriptionJob,
} from '../gateways/transcription.gateway';

@Injectable()
export class ScheduleTranscriptionUsecase {
  private readonly logger = new Logger(ScheduleTranscriptionUsecase.name);

  constructor(
    @Inject('TranscriptionGateway')
    private readonly transcriptionGateway: ITranscriptionGateway,
  ) {}

  async execute(jobs: TranscriptionJob[]): Promise<void> {
    this.logger.log(`Starting transcription batch for ${jobs.length} videos`);

    for (const job of jobs) {
      try {
        this.logger.log(`Processing video: ${job.videoId}`);
        const result = await this.transcriptionGateway.transcribe(job);
        this.logger.log(`Done: ${job.videoId} — ${result.text.length} chars`);
        // TODO: sauvegarder en base + upload VTT sur S3
      } catch (err) {
        this.logger.error(`Failed for video ${job.videoId}:`, err);
      }
    }

    this.logger.log('Batch transcription complete');
  }
}
