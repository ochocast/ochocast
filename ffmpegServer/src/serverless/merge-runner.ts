import {
  PermanentFailureReason,
  PermanentJobError,
  RecordingMergeJob,
  RecordingMergeResult,
} from '../types/job.types';
import { MergeService } from '../services/merge.service';
import { MergeBackendClient } from './merge-backend-client';
import { HttpError } from './job-envelope';

/** US-3 — Same lifecycle as JobRunner: claim, merge, report, then acknowledge. */
export class MergeRunner {
  constructor(
    private readonly backend: Pick<MergeBackendClient, 'claim' | 'complete'>,
    private readonly merger: Pick<MergeService, 'merge' | 'remove'>,
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
    // Logged only: the backend contract carries `permanent`, not the reason.
    let permanentReason: PermanentFailureReason | undefined;
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
      // Timeouts, aborts, S3 errors and FFmpeg crashes stay retryable; only
      // what another attempt would hit again (same bytes) is permanent.
      if (error instanceof PermanentJobError) permanentReason = error.reason;
      result = {
        jobId: job.jobId,
        recordingId: job.recordingId,
        success: false,
        duration: 0,
        error: (error instanceof Error ? error.message : String(error)).slice(
          -2000,
        ),
        processedAt: Date.now(),
        ...(permanentReason ? { permanent: true } : {}),
      };
    } finally {
      clearTimeout(timer);
      shutdownSignal.removeEventListener('abort', abort);
    }
    // Do not acknowledge the trigger until the backend has stored the result.
    const stored = await this.backend.complete(
      job.jobId,
      claim.leaseToken,
      result,
    );
    if (stored === 'gone') {
      // The montage was deleted during the merge: the backend already removed
      // its object, so the MP4 uploaded since would never be referenced.
      if (result.success)
        await this.removeOrphan(job.jobId, claim.job.targetKey);
      return;
    }
    if (permanentReason) {
      console.warn(
        `Merge job ${job.jobId} failed permanently (${permanentReason}); message acknowledged`,
      );
      return;
    }
    if (!result.success)
      throw new HttpError(503, 'Merge failed; job can be retried');
  }

  /** Best effort: a leftover object only costs storage, never the ack. */
  private async removeOrphan(jobId: string, key: string): Promise<void> {
    try {
      await this.merger.remove(key);
      console.log(`Merge job ${jobId} deleted; removed its uploaded ${key}`);
    } catch (error) {
      console.error(
        `Merge job ${jobId} deleted; could not remove ${key}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
