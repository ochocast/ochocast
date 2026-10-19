import { RecordingMergeJob, RecordingMergeResult } from '../types/job.types';
import { MergeService } from '../services/merge.service';
import { MergeBackendClient } from './merge-backend-client';
import { HttpError } from './job-envelope';

/** US-3 — Same lifecycle as JobRunner: claim, merge, report, then acknowledge. */
export class MergeRunner {
  constructor(
    private readonly backend: Pick<MergeBackendClient, 'claim' | 'complete'>,
    private readonly merger: Pick<MergeService, 'merge'>,
    private readonly timeoutMs: number,
  ) {}

  async run(
    job: RecordingMergeJob,
    shutdownSignal: AbortSignal,
  ): Promise<void> {
    const claim = await this.backend.claim(job);
    if (claim.status === 'completed') return;
    const controller = new AbortController();
    const abort = () => controller.abort();
    shutdownSignal.addEventListener('abort', abort, { once: true });
    if (shutdownSignal.aborted) abort();
    const timer = setTimeout(abort, this.timeoutMs);
    let result: RecordingMergeResult;
    try {
      if (
        Date.parse(claim.leaseExpiresAt) - Date.now() <
        this.timeoutMs + 30000
      ) {
        throw new Error(
          'Backend lease must exceed job timeout by at least 30 seconds',
        );
      }
      const { duration } = await this.merger.merge(
        claim.job.sourceKeys,
        claim.job.targetKey,
        controller.signal,
      );
      result = {
        jobId: job.jobId,
        recordingId: job.recordingId,
        success: true,
        duration,
        processedAt: Date.now(),
      };
    } catch (error) {
      result = {
        jobId: job.jobId,
        recordingId: job.recordingId,
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
    // Do not acknowledge the trigger until the backend has stored the result.
    await this.backend.complete(job.jobId, claim.leaseToken, result);
    if (!result.success)
      throw new HttpError(503, 'Merge failed; job can be retried');
  }
}
