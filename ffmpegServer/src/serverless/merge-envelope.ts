import { createHmac, timingSafeEqual } from 'node:crypto';
import { RecordingMergeJob } from '../types/job.types';
import { HttpError } from './job-envelope';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SEGMENTS = 50;

const isKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 2048 &&
  !value.split('/').includes('..');

/**
 * Verifies a signed merge message, same scheme as transcoding jobs: HMAC
 * SHA-256 of `JSON.stringify(job)` with TRANSCODING_DISPATCH_SECRET.
 */
export function parseMergeEnvelope(
  value: unknown,
  secret: string,
): RecordingMergeJob {
  if (!value || typeof value !== 'object')
    throw new HttpError(400, 'Invalid job envelope');
  const { job, signature } = value as {
    job?: RecordingMergeJob;
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
  if (
    !UUID.test(job.jobId) ||
    !UUID.test(job.recordingId) ||
    !UUID.test(job.trackId) ||
    !Number.isFinite(job.timestamp)
  ) {
    throw new HttpError(400, 'Invalid job identifiers');
  }
  if (
    !Array.isArray(job.sourceKeys) ||
    job.sourceKeys.length < 2 ||
    job.sourceKeys.length > MAX_SEGMENTS ||
    !job.sourceKeys.every(isKey) ||
    !isKey(job.targetKey)
  ) {
    throw new HttpError(400, 'Invalid job fields');
  }
  return job;
}
