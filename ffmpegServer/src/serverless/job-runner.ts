import {
  PermanentJobError,
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../types/job.types';
import { JobProcessorService } from '../services/job-processor.service';
import { BackendClient } from './backend-client';
import { HttpError } from './job-envelope';

export class JobRunner {
  constructor(
    private readonly backend: Pick<BackendClient, 'claim' | 'complete'>,
    private readonly processor: Pick<JobProcessorService, 'processJob'>,
    private readonly timeoutMs: number,
  ) {}

  async run(
    job: VideoTranscodingJob,
    shutdownSignal: AbortSignal,
  ): Promise<void> {
    const claim = await this.backend.claim(job);
    if (claim.status === 'completed') return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    shutdownSignal.addEventListener('abort', abort, { once: true });
    if (shutdownSignal.aborted) abort();
    // Only the deadline is permanent: an aborted shutdown is retried elsewhere.
    let deadlineExceeded = false;
    const timer = setTimeout(() => {
      deadlineExceeded = !controller.signal.aborted;
      abort();
    }, this.timeoutMs);
    let encodingStartedAt: number | undefined;
    let encodingFinishedAt: number | undefined;
    let result: VideoTranscodingResult;
    try {
      if (
        Date.parse(claim.leaseExpiresAt) - Date.now() <
        this.timeoutMs + 30000
      ) {
        throw new Error(
          'Backend lease must exceed job timeout by at least 30 seconds',
        );
      }
      result = await this.processor.processJob(
        claim.job,
        controller.signal,
        () => {
          encodingStartedAt = Date.now();
        },
        () => {
          encodingFinishedAt = Date.now();
        },
      );
    } catch (error) {
      result = {
        jobId: job.jobId,
        videoId: job.videoId,
        success: false,
        duration: 0,
        error: (error instanceof Error ? error.message : String(error)).slice(
          -2000,
        ),
        processedAt: Date.now(),
        ...(error instanceof PermanentJobError
          ? { permanent: true, reason: error.reason }
          : {}),
      };
    } finally {
      clearTimeout(timer);
      shutdownSignal.removeEventListener('abort', abort);
    }
    if (!result.success && deadlineExceeded && !result.permanent) {
      const deadline = `Transcoding deadline exceeded (${Math.round(this.timeoutMs / 1000)} s)`;
      // The same video would exceed it again while encoding, or after an encode
      // that used half the budget or more: its outputs no longer fit. Before
      // encoding (a stalled S3 read, a slow probe) or after a short encode (a
      // stalled upload), another attempt can succeed; before encoding, the
      // final miniature and subtitle the source fallback relies on may not
      // exist yet either.
      const encoding =
        encodingStartedAt !== undefined && encodingFinishedAt === undefined;
      const longEncode =
        encodingStartedAt !== undefined &&
        encodingFinishedAt !== undefined &&
        encodingFinishedAt - encodingStartedAt >= this.timeoutMs / 2;
      result =
        encoding || longEncode
          ? {
              ...result,
              error: deadline,
              permanent: true,
              reason: 'deadline_exceeded',
            }
          : {
              ...result,
              error: `${deadline} ${encodingStartedAt === undefined ? 'before encoding started' : 'after encoding'}`,
            };
    }
    // Do not acknowledge the trigger until the backend has durably stored the result.
    await this.backend.complete(job.jobId, claim.leaseToken, result);
    if (result.permanent) {
      console.warn(
        `Transcoding job ${job.jobId} failed permanently (${result.reason}); message acknowledged`,
      );
      return;
    }
    if (!result.success)
      throw new HttpError(503, 'Transcoding failed; job can be retried');
  }
}
