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
    let encodingStarted = false;
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
          encodingStarted = true;
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
      // While encoding, the same video would exceed it again. Before (a stalled
      // S3 read, a slow probe) another attempt can succeed, and the final
      // miniature and subtitle the source fallback relies on may not exist yet.
      result = encodingStarted
        ? {
            ...result,
            error: deadline,
            permanent: true,
            reason: 'deadline_exceeded',
          }
        : { ...result, error: `${deadline} before encoding started` };
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
