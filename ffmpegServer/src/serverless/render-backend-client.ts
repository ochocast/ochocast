import {
  VideoEditRenderJob,
  VideoEditRenderMessage,
  VideoEditRenderResult,
} from '../types/job.types';
import { HttpError } from './job-envelope';
import { isValidRenderJob } from './render-envelope';

export type RenderClaim =
  | { status: 'completed' }
  | {
      status: 'claimed';
      leaseToken: string;
      leaseExpiresAt: string;
      job: VideoEditRenderJob;
    };

/**
 * Callbacks of the render worker, mirroring MergeBackendClient: same secret
 * header, 410 = job deleted (message discarded), 404 and redirects are never
 * treated as a success.
 */
export class RenderBackendClient {
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  async claim(message: VideoEditRenderMessage): Promise<RenderClaim> {
    const response = await this.post(message.jobId, 'claim', {
      editId: message.editId,
    });
    // Deleting the video cascades to its montage and job: drop the message.
    if (response.status === 410) {
      console.log(`Render job ${message.jobId} deleted; message discarded`);
      return { status: 'completed' };
    }
    if (response.status === 409)
      throw new HttpError(503, 'Job already being processed');
    if (!response.ok)
      throw new HttpError(503, `Job claim failed (${response.status})`);
    const claim = (await response.json()) as RenderClaim;
    if (claim.status === 'completed') return claim;
    if (
      claim.status !== 'claimed' ||
      !claim.leaseToken ||
      !Number.isFinite(Date.parse(claim.leaseExpiresAt)) ||
      !isValidRenderJob(claim.job, message)
    ) {
      throw new HttpError(503, 'Invalid backend claim response');
    }
    return claim;
  }

  /**
   * 'gone' when the video was deleted meanwhile (410): its job row went with
   * it, and the files uploaded by this attempt are now the caller's to remove.
   */
  async complete(
    jobId: string,
    leaseToken: string,
    result: VideoEditRenderResult,
  ): Promise<'stored' | 'gone'> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.post(jobId, 'result', {
          leaseToken,
          result,
        });
        if (response.ok) return 'stored';
        if (response.status === 410) {
          console.log(`Render job ${jobId} deleted; result discarded`);
          return 'gone';
        }
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

  private async post(
    jobId: string,
    action: string,
    body: unknown,
  ): Promise<Response> {
    const response = await fetch(
      `${this.baseUrl}/internal/video-edits/render-jobs/${encodeURIComponent(jobId)}/${action}`,
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
        `Render callback redirected (${response.status})`,
      );
    if (response.status === 404)
      throw new HttpError(503, 'Render callback route not found (404)');
    return response;
  }
}
