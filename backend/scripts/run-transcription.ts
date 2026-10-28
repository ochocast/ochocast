import 'reflect-metadata';
import db from '../src/config/typeorm.config';
import { createS3Client } from '../src/s3.module';
import { TranscriptionService } from '../src/transcription/transcription.service';

async function main() {
  const s3 = createS3Client();
  try {
    await db.initialize();
    const service = new TranscriptionService(db, s3);
    if (!service.enabled)
      throw new Error('Set TRANSCRIPTION_ENABLED=true before running a batch');
    const summary = await service.run();
    console.log(summary || 'Another backend already owns the batch lock');
    if (summary?.failed) process.exitCode = 1;
  } finally {
    s3.destroy();
    if (db.isInitialized) await db.destroy();
  }
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
