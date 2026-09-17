import {
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
    const timer = setTimeout(abort, this.timeoutMs);
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
      result = await this.processor.processJob(claim.job, controller.signal);
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
      };
    } finally {
      clearTimeout(timer);
      shutdownSignal.removeEventListener('abort', abort);
    }
    // Do not acknowledge the trigger until the backend has durably stored the result.
    await this.backend.complete(job.jobId, claim.leaseToken, result);
    if (!result.success)
      throw new HttpError(503, 'Transcoding failed; job can be retried');
  }
}
