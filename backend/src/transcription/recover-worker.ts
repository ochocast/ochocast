import 'reflect-metadata';
import { S3Client } from '@aws-sdk/client-s3';
import db from '../config/typeorm.config';
import { TranscriptionService } from './transcription.service';

/** Standalone recovery for a scheduler independent of backend replicas. */
async function main() {
  // This process may only stop an orphan; it must never start a batch.
  process.env.TRANSCRIPTION_ENABLED = 'false';
  const stopUrl = process.env.WORKER_STOP_URL;
  const token = process.env.WORKER_CONTROL_TOKEN;
  if (!stopUrl || !token || token.length < 32)
    throw new Error('Worker recovery requires a stop URL and control token');
  const parsed = new URL(stopUrl);
  if (
    parsed.username ||
    parsed.password ||
    !['https:', 'http:'].includes(parsed.protocol)
  )
    throw new Error('Invalid worker stop URL');
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
    throw new Error('Worker recovery requires HTTPS in production');
  try {
    await db.initialize();
    // recover() never accesses S3; no storage credentials are required.
    await new TranscriptionService(db, null as unknown as S3Client).recover();
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}

void main().catch((error) => {
  console.error('Worker recovery failed:', error.message);
  process.exitCode = 1;
});
