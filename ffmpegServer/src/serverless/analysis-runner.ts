import {
  AnalysisMessage,
  AnalysisResult,
  analysisSettings,
} from '../types/analysis.types';
import { PermanentJobError } from '../types/job.types';
import { AnalysisService } from '../services/analysis.service';
import { AnalysisBackendClient } from './analysis-backend-client';
import { HttpError } from './job-envelope';
export class AnalysisRunner {
  constructor(
    private readonly backend: Pick<
      AnalysisBackendClient,
      'claim' | 'complete' | 'progress'
    >,
    private readonly analyzer: Pick<AnalysisService, 'analyze'>,
    private readonly timeoutCeiling = analysisSettings().timeoutMs,
  ) {}
  async run(message: AnalysisMessage, shutdownSignal: AbortSignal) {
    const claim = await this.backend.claim(message);
    if (claim.status === 'completed') return;
    const timeoutMs = Math.min(
      claim.job.settings.timeoutMs,
      this.timeoutCeiling,
    );
    const controller = new AbortController();
    const abort = () => controller.abort();
    shutdownSignal.addEventListener('abort', abort, { once: true });
    if (shutdownSignal.aborted) abort();
    let deadline = false;
    const timer = setTimeout(() => {
      deadline = !controller.signal.aborted;
      abort();
    }, timeoutMs);
    let lastProgress = -Infinity,
      progressTail = Promise.resolve(),
      progressBusy = false;
    let result: AnalysisResult;
    try {
      if (Date.parse(claim.leaseExpiresAt) - Date.now() < timeoutMs + 30000)
        throw new Error('Analysis lease too short');
      result = await this.analyzer.analyze(
        claim.job,
        controller.signal,
        (seconds) => {
          if (progressBusy || Date.now() - lastProgress < 2000) return;
          lastProgress = Date.now();
          progressBusy = true;
          // A lost progress update is nonfatal; callbacks never overlap.
          progressTail = this.backend
            .progress(message.jobId, claim.leaseToken, seconds)
            .catch(() => {})
            .finally(() => {
              progressBusy = false;
            });
        },
      );
    } catch (error) {
      result = {
        jobId: message.jobId,
        success: false,
        error: deadline
          ? `Analysis deadline exceeded (${timeoutMs} ms)`
          : (error instanceof Error ? error.message : String(error)).slice(
              -2000,
            ),
        permanent: deadline || error instanceof PermanentJobError,
      };
    } finally {
      clearTimeout(timer);
      shutdownSignal.removeEventListener('abort', abort);
    }
    await progressTail;
    await this.backend.complete(message.jobId, claim.leaseToken, result);
    if (!result.success && !result.permanent)
      throw new HttpError(503, 'Analysis failed; retrying');
  }
}
