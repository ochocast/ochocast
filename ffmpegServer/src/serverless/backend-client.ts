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
    // Deleting a video cascades to its job (410). Discard its signed, obsolete message.
    if (response.status === 410) {
      console.log(`Transcoding job ${job.jobId} deleted; message discarded`);
      return { status: 'completed' };
    }
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
      let response: Response;
      try {
        response = await this.post(jobId, 'result', {
          leaseToken,
          result,
        });
      } catch (error) {
        if (error instanceof HttpError || attempt === 2) throw error;
        continue;
      }
      if (response.ok) return;
      if (response.status === 410) {
        console.log(`Transcoding job ${jobId} deleted; result discarded`);
        return;
      }
      // A backend predating permanent failures rejects their fields (400):
      // store a plain failure instead. Deploy the backend first to keep them.
      if (response.status === 400 && result.permanent) {
        console.warn(
          `Backend rejected permanent failure fields for job ${jobId}; storing a plain failure`,
        );
        const plain = { ...result };
        delete plain.permanent;
        delete plain.reason;
        return this.complete(jobId, leaseToken, plain);
      }
      if (response.status < 500)
        throw new HttpError(
          502,
          `Result callback rejected (${response.status})`,
        );
    }
    throw new HttpError(503, 'Result callback unavailable');
  }

  private async post(
    jobId: string,
    action: string,
    body: unknown,
  ): Promise<Response> {
    const response = await fetch(
      `${this.baseUrl}/internal/transcoding/jobs/${encodeURIComponent(jobId)}/${action}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Transcoding-Token': this.secret,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
        // A redirect would turn the POST into a GET and could forward the secret.
        redirect: 'manual',
      },
    );
    if (response.status >= 300 && response.status < 400)
      throw new HttpError(
        503,
        `Transcoding callback redirected (${response.status})`,
      );
    // A deleted job answers 410; a 404 is a misrouted callback, never a success.
    if (response.status === 404)
      throw new HttpError(503, 'Transcoding callback route not found (404)');
    return response;
  }
}
