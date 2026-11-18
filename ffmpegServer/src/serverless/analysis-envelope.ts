import { createHmac, timingSafeEqual } from 'node:crypto';
import { AnalysisJob, AnalysisMessage } from '../types/analysis.types';
import { VideoEditRenderMessage } from '../types/job.types';
import { HttpError } from './job-envelope';
import { parseRenderEnvelope } from './render-envelope';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type SharedEditMessage = AnalysisMessage | VideoEditRenderMessage;
export function parseEditEnvelope(
  value: unknown,
  secret: string,
): SharedEditMessage {
  const envelope = value as {
    job?: Record<string, unknown>;
    signature?: unknown;
  } | null;
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    !envelope.job ||
    typeof envelope.job !== 'object' ||
    typeof envelope.signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(envelope.signature)
  )
    throw new HttpError(401, 'Invalid job signature');
  const expected = createHmac('sha256', secret)
    .update(JSON.stringify(envelope.job))
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(envelope.signature, 'hex')))
    throw new HttpError(401, 'Invalid job signature');
  const job = envelope.job;
  if (job.type === undefined || job.type === 'render')
    return parseRenderEnvelope(value, secret);
  if (job.type !== 'silence_analysis')
    throw new HttpError(400, 'Unsupported edit job type');
  if (
    typeof job.jobId !== 'string' ||
    !UUID.test(job.jobId) ||
    typeof job.videoId !== 'string' ||
    !UUID.test(job.videoId) ||
    typeof job.timestamp !== 'number' ||
    !Number.isFinite(job.timestamp) ||
    'editId' in job ||
    'version' in job
  )
    throw new HttpError(400, 'Invalid analysis message');
  return job as unknown as AnalysisMessage;
}
export function isAnalysis(
  message: SharedEditMessage,
): message is AnalysisMessage {
  return 'type' in message && message.type === 'silence_analysis';
}
export function validAnalysisJob(
  job: AnalysisJob | undefined,
  message: AnalysisMessage,
): job is AnalysisJob {
  const settings = job?.settings;
  return (
    !!job &&
    job.type === 'silence_analysis' &&
    job.jobId === message.jobId &&
    job.videoId === message.videoId &&
    job.timestamp === message.timestamp &&
    typeof job.sourceKey === 'string' &&
    job.sourceKey.length > 0 &&
    job.sourceKey.length <= 2048 &&
    !job.sourceKey.split('/').includes('..') &&
    typeof job.sourceEtag === 'string' &&
    job.sourceEtag.length > 0 &&
    Number.isSafeInteger(job.sourceBytes) &&
    job.sourceBytes > 0 &&
    Number.isFinite(job.duration) &&
    job.duration >= 1 &&
    !!settings &&
    Number.isFinite(settings.noiseDb) &&
    settings.noiseDb >= -90 &&
    settings.noiseDb <= -5 &&
    Number.isFinite(settings.minSilenceSeconds) &&
    settings.minSilenceSeconds >= 0.1 &&
    settings.minSilenceSeconds <= 60 &&
    Number.isInteger(settings.timeoutMs) &&
    settings.timeoutMs >= 1000 &&
    settings.timeoutMs <= 600000
  );
}
