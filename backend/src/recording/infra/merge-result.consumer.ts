import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from 'src/queue/queue.service';
import { MergeRecordingResult } from 'src/queue/job.types';
import { IRecordingRepositoryGateway } from '../domain/gateways/recording-repository.gateway';

/**
 * US-3 — Applies the outcome of a merge job: flips the merged recording to
 * `ready` (with its duration) or `failed`.
 */
@Injectable()
export class MergeResultConsumer implements OnModuleInit {
  private readonly logger = new Logger(MergeResultConsumer.name);

  constructor(
    private readonly queueService: QueueService,
    @Inject('RecordingRepositoryGateway')
    private readonly recordingRepository: IRecordingRepositoryGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queueService.consumeMergeResults((result) =>
      this.handleResult(result),
    );
  }

  private async handleResult(result: MergeRecordingResult): Promise<void> {
    const updated = await this.recordingRepository.updateRecording(
      result.recordingId,
      result.success
        ? { status: 'ready', duration: result.duration ?? null }
        : { status: 'failed' },
    );

    if (!updated) {
      this.logger.warn(
        `Merge result for unknown recording ${result.recordingId}`,
      );
      return;
    }
    this.logger.log(
      `Merged recording ${result.recordingId} status: ${updated.status}`,
    );
  }
}
