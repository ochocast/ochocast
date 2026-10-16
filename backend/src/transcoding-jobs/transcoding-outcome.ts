import type { VideoTranscodingResult } from '../queue/job.types';
import type { TranscodingJobEntity } from './transcoding-job.entity';

/**
 * Why a video failed for good. Stored in video.transcoding_error and exposed
 * publicly: never free text, a worker error may hold paths or config names.
 */
export const FINAL_FAILURE_REASONS = [
  'invalid_source',
  'source_too_large',
  'duration_exceeded',
  'deadline_exceeded',
  'max_attempts',
  'unknown',
] as const;
export type FinalFailureReason = (typeof FINAL_FAILURE_REASONS)[number];

const KNOWN_REASONS = new Set<string>(FINAL_FAILURE_REASONS);

export const finalFailureReason = (
  reason?: string | null,
): FinalFailureReason =>
  KNOWN_REASONS.has(reason) ? (reason as FinalFailureReason) : 'unknown';

type FailureState = {
  status: TranscodingJobEntity['status'];
  attempts: number;
  result: { retryable?: boolean } | null;
};

/**
 * Another attempt will run. Only failures complete() marked retryable: those
 * an older backend recorded have no marker, invalid sources among them.
 */
const isRetryableFailure = (job: FailureState, maxAttempts: number): boolean =>
  job.status === 'failed' &&
  job.result?.retryable === true &&
  job.attempts < maxAttempts;

/** No attempt will run again: permanent, attempts spent, or never marked. */
export const isFinalFailure = (job: FailureState, maxAttempts: number) =>
  job.status === 'failed' && !isRetryableFailure(job, maxAttempts);

/** What complete() stores for a failed attempt: final, or marked retryable. */
export const recordedFailure = (
  result: VideoTranscodingResult,
  attempts: number,
  maxAttempts: number,
): VideoTranscodingResult => {
  if (result.permanent) return result;
  // The last allowed attempt failed: final, like claim's abandonment.
  if (attempts >= maxAttempts)
    return { ...result, permanent: true, reason: 'max_attempts' };
  return { ...result, retryable: true };
};

/** Result of a job given up after TRANSCODING_MAX_ATTEMPTS claims. */
export const abandonedResult = (
  job: Pick<TranscodingJobEntity, 'id' | 'videoId' | 'attempts'>,
  processedAt: number,
): VideoTranscodingResult => ({
  jobId: job.id,
  videoId: job.videoId,
  success: false,
  duration: 0,
  error: `Transcoding abandoned after ${job.attempts} attempts`,
  processedAt,
  permanent: true,
  reason: 'max_attempts',
});

export function transcodingLeaseSeconds(): number {
  const value = Number(process.env.TRANSCODING_LEASE_SECONDS || 3600);
  if (!Number.isInteger(value) || value < 60)
    throw new Error('TRANSCODING_LEASE_SECONDS must be an integer >= 60');
  return value;
}

export function transcodingMaxAttempts(): number {
  const value = Number(process.env.TRANSCODING_MAX_ATTEMPTS || 10);
  if (!Number.isInteger(value) || value < 1)
    throw new Error('TRANSCODING_MAX_ATTEMPTS must be a positive integer');
  return value;
}
