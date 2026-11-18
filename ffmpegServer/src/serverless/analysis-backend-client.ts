import {
  AnalysisJob,
  AnalysisMessage,
  AnalysisResult,
} from '../types/analysis.types';
import { HttpError } from './job-envelope';
import { validAnalysisJob } from './analysis-envelope';
export type AnalysisClaim =
  | { status: 'completed' }
  | {
      status: 'claimed';
      leaseToken: string;
      leaseExpiresAt: string;
      job: AnalysisJob;
    };
export class AnalysisBackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}
  private async post(id: string, action: string, body: unknown) {
    return fetch(
      `${this.baseUrl}/internal/video-edits/analysis-jobs/${encodeURIComponent(id)}/${action}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transcoding-Token': this.secret,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
      },
    );
  }
  async claim(message: AnalysisMessage): Promise<AnalysisClaim> {
    const response = await this.post(message.jobId, 'claim', {
      videoId: message.videoId,
    });
    if (response.status === 410) return { status: 'completed' };
    if (!response.ok)
      throw new HttpError(503, `Analysis claim failed (${response.status})`);
    const claim = (await response.json()) as AnalysisClaim;
    if (claim.status === 'completed') return claim;
    if (
      claim.status !== 'claimed' ||
      !claim.leaseToken ||
      !Number.isFinite(Date.parse(claim.leaseExpiresAt)) ||
      !validAnalysisJob(claim.job, message)
    )
      throw new HttpError(503, 'Invalid analysis claim');
    return claim;
  }
  async progress(id: string, leaseToken: string, processedSeconds: number) {
    const response = await this.post(id, 'progress', {
      leaseToken,
      processedSeconds,
    });
    if (!response.ok && response.status !== 410)
      throw new Error(`Analysis progress rejected (${response.status})`);
  }
  async complete(id: string, leaseToken: string, result: AnalysisResult) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.post(id, 'result', { leaseToken, result });
        if (response.ok || response.status === 410) return;
        if (response.status < 500)
          throw new HttpError(
            503,
            `Analysis callback rejected (${response.status})`,
          );
      } catch (error) {
        if (error instanceof HttpError || attempt === 2) throw error;
      }
    }
    throw new HttpError(503, 'Analysis callback unavailable');
  }
}
