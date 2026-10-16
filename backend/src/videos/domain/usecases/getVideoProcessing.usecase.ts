import { Inject, NotFoundException } from '@nestjs/common';
import {
  FinalFailureReason,
  finalFailureReason,
  isFinalFailure,
  transcodingLeaseSeconds,
  transcodingMaxAttempts,
} from 'src/transcoding-jobs/transcoding-outcome';
import { IVideoProcessingGateway } from '../gateways/videoProcessing.gateway';
import {
  ProcessingJob,
  ProcessingState,
  ProcessingVideo,
  VideoProcessingStatus,
} from '../videoProcessing';

// Only transcoder output is HLS; anything else is played from its source.
const isHls = (mediaId: string) => mediaId.endsWith('/master.m3u8');

const status = (
  state: ProcessingState,
  fields: Partial<VideoProcessingStatus> = {},
): VideoProcessingStatus => ({
  state,
  since: null,
  reason: null,
  playedFromSource: false,
  ...fields,
});

/**
 * Public and polled: two indexed single-row reads, no relations. A video is
 * failed only once no attempt will run again; until then it is processing.
 */
export class GetVideoProcessingUsecase {
  private readonly leaseSeconds = transcodingLeaseSeconds();
  private readonly maxAttempts = transcodingMaxAttempts();

  constructor(
    @Inject('VideoProcessingGateway')
    private readonly gateway: IVideoProcessingGateway,
  ) {}

  async execute(id: string, now = Date.now()): Promise<VideoProcessingStatus> {
    const video = await this.gateway.findVideo(id);
    if (!video) throw new NotFoundException('Video not found');
    if (video.transcoding_status === 'ready')
      return status('ready', { playedFromSource: !isHls(video.media_id) });
    const job = await this.gateway.findJob(id);
    if (job && isFinalFailure(job, this.maxAttempts))
      return status('failed', { reason: this.finalReason(job) });
    switch (job?.status) {
      case 'processing':
        return this.processing(job, now);
      // Marked retryable: redelivered, or republished by reconciliation.
      case 'failed':
        return status('retrying');
      case 'pending':
        return job.attempts > 0 ? status('retrying') : this.queued(video);
      // No job: a recording whose job could not be registered.
      default:
        return video.transcoding_status === 'failed'
          ? status('failed', {
              reason: finalFailureReason(video.transcoding_error),
            })
          : this.queued(video);
    }
  }

  // Without a permanent reason: attempts spent, or recorded by an older backend.
  private finalReason(job: ProcessingJob): FinalFailureReason {
    if (job.result?.permanent) return finalFailureReason(job.result.reason);
    return job.attempts >= this.maxAttempts ? 'max_attempts' : 'unknown';
  }

  private queued(video: ProcessingVideo) {
    return status('queued', { since: video.createdAt.toISOString() });
  }

  private processing(job: ProcessingJob, now: number) {
    const expiresAt = job.leaseExpiresAt?.getTime();
    if (!expiresAt || expiresAt <= now) {
      // A dead worker on the last allowed attempt: the next claim or
      // reconciliation abandons the job instead of running it again.
      if (job.attempts >= this.maxAttempts)
        return status('failed', { reason: 'max_attempts' });
      // Otherwise reconciliation republishes the job once the lease expired.
      return status('retrying');
    }
    const startedAt = Math.min(now, expiresAt - this.leaseSeconds * 1000);
    return status('processing', { since: new Date(startedAt).toISOString() });
  }
}
