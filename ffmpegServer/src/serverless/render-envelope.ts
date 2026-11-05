import { createHmac, timingSafeEqual } from 'node:crypto';
import { VideoEditRenderJob, VideoEditRenderMessage } from '../types/job.types';
import { HttpError } from './job-envelope';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SEGMENTS = 100;
const MAX_TEXT_LAYERS = 10;
const MAX_TEXT_LENGTH = 500;
const POSITIONS = new Set(['top', 'center', 'bottom']);
const COLORS = new Set(['white', 'black', 'green']);

const isKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 2048 &&
  !value.split('/').includes('..');
const isTime = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

/**
 * Verifies a signed render message, same scheme as transcoding jobs: HMAC
 * SHA-256 of `JSON.stringify(job)` with TRANSCODING_DISPATCH_SECRET.
 */
export function parseRenderEnvelope(
  value: unknown,
  secret: string,
): VideoEditRenderMessage {
  if (!value || typeof value !== 'object')
    throw new HttpError(400, 'Invalid job envelope');
  const { job, signature } = value as {
    job?: VideoEditRenderMessage;
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
    !UUID.test(job.editId) ||
    !UUID.test(job.videoId) ||
    !Number.isInteger(job.version) ||
    job.version < 1 ||
    !Number.isFinite(job.timestamp)
  ) {
    throw new HttpError(400, 'Invalid job identifiers');
  }
  return job;
}

/**
 * The full job returned by the claim must be the message's job, write only
 * in its own folder, and stay within the montage limits. Defense in depth:
 * the backend already validated it.
 */
export function isValidRenderJob(
  job: VideoEditRenderJob | undefined,
  message: VideoEditRenderMessage,
): job is VideoEditRenderJob {
  if (
    !job ||
    job.jobId !== message.jobId ||
    job.editId !== message.editId ||
    job.videoId !== message.videoId ||
    job.version !== message.version ||
    job.outputPrefix !== `${message.videoId}/edits/${message.jobId}` ||
    !isKey(job.sourceKey) ||
    !Array.isArray(job.segments) ||
    job.segments.length < 1 ||
    job.segments.length > MAX_SEGMENTS
  )
    return false;
  return job.segments.every(
    (segment) =>
      isTime(segment.sourceStart) &&
      isTime(segment.sourceEnd) &&
      segment.sourceEnd > segment.sourceStart &&
      Array.isArray(segment.textLayers) &&
      segment.textLayers.length <= MAX_TEXT_LAYERS &&
      segment.textLayers.every(
        (layer) =>
          typeof layer.content === 'string' &&
          layer.content.trim().length > 0 &&
          layer.content.length <= MAX_TEXT_LENGTH &&
          POSITIONS.has(layer.position) &&
          COLORS.has(layer.color) &&
          isTime(layer.startOffset) &&
          isTime(layer.duration) &&
          layer.duration > 0,
      ),
  );
}
