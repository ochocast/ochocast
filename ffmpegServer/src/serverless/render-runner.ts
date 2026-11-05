import {
  PermanentJobError,
  VideoEditRenderMessage,
  VideoEditRenderResult,
} from '../types/job.types';
import { RenderService } from '../services/render.service';
import { RenderBackendClient } from './render-backend-client';
import { HttpError } from './job-envelope';

/** Same lifecycle as MergeRunner: claim, render, report, then acknowledge. */
export class RenderRunner {
  constructor(
    private readonly backend: Pick<RenderBackendClient, 'claim' | 'complete'>,
    private readonly renderer: Pick<RenderService, 'render' | 'remove'>,
    private readonly timeoutMs: number,
  ) {}

  async run(
    message: VideoEditRenderMessage,
    shutdownSignal: AbortSignal,
  ): Promise<void> {
    const claim = await this.backend.claim(message);
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
    let result: VideoEditRenderResult;
    try {
      if (
        Date.parse(claim.leaseExpiresAt) - Date.now() <
        this.timeoutMs + 30000
      ) {
        throw new Error(
          'Backend lease must exceed job timeout by at least 30 seconds',
        );
      }
      const { duration, mediaId } = await this.renderer.render(
        claim.job,
        controller.signal,
        () => {
          encodingStarted = true;
        },
      );
      result = {
        jobId: message.jobId,
        editId: message.editId,
        success: true,
        duration,
        mediaId,
        processedAt: Date.now(),
      };
    } catch (error) {
      result = {
        jobId: message.jobId,
        editId: message.editId,
        success: false,
        duration: 0,
        error: (error instanceof Error ? error.message : String(error)).slice(
          -2000,
        ),
        processedAt: Date.now(),
        ...(error instanceof PermanentJobError &&
        error.reason !== 'duration_exceeded'
          ? { permanent: true, reason: error.reason }
          : {}),
      };
      // Once encoding started, the same montage would not fit next time
      // either; before (a stalled S3 read), another attempt can succeed.
      if (deadlineExceeded && !result.permanent) {
        const deadline = `Render deadline exceeded (${Math.round(this.timeoutMs / 1000)} s)`;
        result = encodingStarted
          ? {
              ...result,
              error: deadline,
              permanent: true,
              reason: 'deadline_exceeded',
            }
          : { ...result, error: `${deadline} before encoding started` };
      }
    } finally {
      clearTimeout(timer);
      shutdownSignal.removeEventListener('abort', abort);
    }
    // Do not acknowledge the trigger until the backend has stored the result.
    const stored = await this.backend.complete(
      message.jobId,
      claim.leaseToken,
      result,
    );
    if (stored === 'gone') {
      // The video was deleted during the render: nothing will reference the
      // files uploaded since, and the backend can no longer find them.
      await this.removeOrphan(message.jobId, claim.job.outputPrefix);
      return;
    }
    if (result.permanent) {
      console.warn(
        `Render job ${message.jobId} failed permanently (${result.reason}); message acknowledged`,
      );
      return;
    }
    if (!result.success)
      throw new HttpError(503, 'Render failed; job can be retried');
  }

  /** Best effort: a leftover folder only costs storage, never the ack. */
  private async removeOrphan(jobId: string, prefix: string): Promise<void> {
    try {
      await this.renderer.remove(prefix);
      console.log(`Render job ${jobId} deleted; removed its files`);
    } catch (error) {
      // One string, never a format: the job id comes from the message.
      const reason = error instanceof Error ? error.message : String(error);
      console.error(
        `Render job ${jobId} deleted; could not remove its files: ${reason}`,
      );
    }
  }
}
