import {
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../types/job.types';
import { HttpError } from './job-envelope';

export type Claim =
  | { status: 'completed' }
  | {
      status: 'claimed';
      leaseToken: string;
      leaseExpiresAt: string;
      job: VideoTranscodingJob;
    };

export class BackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  async claim(job: VideoTranscodingJob): Promise<Claim> {
    const response = await this.post(job.jobId, 'claim', {
      videoId: job.videoId,
    });
    // Deleting a video cascades to its job. Discard its signed, obsolete message.
    if (response.status === 404) return { status: 'completed' };
    if (response.status === 409)
      throw new HttpError(503, 'Job already being processed');
    if (!response.ok)
      throw new HttpError(503, `Job claim failed (${response.status})`);
    const claim = (await response.json()) as Claim;
    if (claim.status === 'completed') return claim;
    if (
      claim.status !== 'claimed' ||
      !claim.leaseToken ||
      !Number.isFinite(Date.parse(claim.leaseExpiresAt)) ||
      claim.job?.jobId !== job.jobId ||
      claim.job.videoId !== job.videoId
    ) {
      throw new HttpError(503, 'Invalid backend claim response');
    }
    return claim;
  }

  async complete(
    jobId: string,
    leaseToken: string,
    result: VideoTranscodingResult,
  ): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.post(jobId, 'result', {
          leaseToken,
          result,
        });
        if (response.ok || response.status === 404) return;
        if (response.status < 500)
          throw new HttpError(
            502,
            `Result callback rejected (${response.status})`,
          );
      } catch (error) {
        if (error instanceof HttpError || attempt === 2) throw error;
      }
    }
    throw new HttpError(503, 'Result callback unavailable');
  }

  private post(
    jobId: string,
    action: string,
    body: unknown,
  ): Promise<Response> {
    return fetch(
      `${this.baseUrl}/internal/transcoding/jobs/${encodeURIComponent(jobId)}/${action}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transcoding-Token': this.secret,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
  }
}
