import { createHmac, timingSafeEqual } from 'node:crypto';
import { VideoTranscodingJob } from '../types/job.types';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function parseJobEnvelope(
  value: unknown,
  secret: string,
): VideoTranscodingJob {
  if (!value || typeof value !== 'object')
    throw new HttpError(400, 'Invalid job envelope');
  const { job, signature } = value as {
    job?: VideoTranscodingJob;
    signature?: string;
  };
  if (
    !job ||
    typeof job !== 'object' ||
    typeof signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    throw new HttpError(401, 'Invalid job signature');
  }
  const expected = createHmac('sha256', secret)
    .update(JSON.stringify(job))
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex')))
    throw new HttpError(401, 'Invalid job signature');
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !uuid.test(job.jobId) ||
    !uuid.test(job.videoId) ||
    !Number.isFinite(job.timestamp)
  ) {
    throw new HttpError(400, 'Invalid job identifiers');
  }
  const required = [
    'originalKey',
    'originalFileName',
    'media_id',
    'miniature_id',
    'title',
  ] as const;
  if (
    required.some(
      (key) =>
        typeof job[key] !== 'string' || !job[key] || job[key].length > 2048,
    )
  ) {
    throw new HttpError(400, 'Invalid job fields');
  }
  return job;
}
