import 'reflect-metadata';
import { S3Client } from '@aws-sdk/client-s3';
import db from '../config/typeorm.config';
import { TranscriptionService } from './transcription.service';

/** Standalone recovery for a scheduler independent of backend replicas. */
async function main() {
  // This process may only stop an orphan; it must never start a batch.
  process.env.TRANSCRIPTION_ENABLED = 'false';
  if (!process.env.WORKER_STOP_URL)
    throw new Error('Worker recovery requires a stop URL and control token');
  // recover() never accesses S3; no storage credentials are required. The
  // service checks the stop URL and token as it does in the backend.
  const service = new TranscriptionService(db, null as unknown as S3Client);
  try {
    await db.initialize();
    await service.recover();
  } finally {
    if (db.isInitialized) await db.destroy();
  }
}

void main().catch((error) => {
  console.error('Worker recovery failed:', error.message);
  process.exitCode = 1;
});
