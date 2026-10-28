import 'reflect-metadata';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import db from '../src/config/typeorm.config';
import { createS3Client } from '../src/s3.module';
import { QueueService } from '../src/queue/queue.service';
import { TranscodingJobsService } from '../src/transcoding-jobs/transcoding-jobs.service';

// Read-only by default. Explicit --enqueue is required to change rows or queue
// jobs; no VM is started by this command. Sources are never deleted here.
async function main() {
  const apply = process.argv.includes('--enqueue');
  const flags = process.argv.slice(2);
  if (flags.some((flag) => flag !== '--enqueue'))
    throw new Error('Only --enqueue is supported');
  const s3 = createS3Client();
  try {
    await db.initialize();
    const videos = await db.query(`SELECT v.id, j.payload FROM video_entity v
      LEFT JOIN LATERAL (SELECT payload FROM transcoding_job
        WHERE "videoId" = v.id AND status = 'ready' LIMIT 1) j ON true
      WHERE v.archived = false AND v.transcoding_status = 'ready'
        AND (v.subtitle_id IS NULL OR v.subtitle_id = '')
        AND v.transcription_status = 'waiting_audio' ORDER BY v."createdAt"`);
    let queue: QueueService;
    const exists = async (key: string) => {
      try {
        await s3.send(
          new HeadObjectCommand({
            Bucket: process.env.STOCK_MEDIA_BUCKET,
            Key: key,
          }),
        );
        return true;
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 404) return false;
        throw error; // Never mistake invalid permissions for a missing source.
      }
    };
    for (const video of videos) {
      let audioKey: string | undefined;
      for (const extension of ['flac', 'wav']) {
        const candidate = `${video.id}/audio.${extension}`;
        if (await exists(candidate)) {
          audioKey = candidate;
          break;
        }
      }
      if (audioKey) {
        console.log(
          `${video.id}: existing audio ${apply ? 'queued for transcription' : '(dry run)'}`,
        );
        if (apply)
          await db.query(
            `UPDATE video_entity SET audio_key = $2,
          has_audio = true, transcription_status = 'pending'
          WHERE id = $1 AND transcription_status = 'waiting_audio'
            AND archived = false AND (subtitle_id IS NULL OR subtitle_id = '')`,
            [video.id, audioKey],
          );
      } else if (
        video.payload?.originalKey &&
        (await exists(video.payload.originalKey))
      ) {
        console.log(
          `${video.id}: source available, ${apply ? 'requeueing FFmpeg' : 'needs FFmpeg extraction (dry run)'}`,
        );
        if (apply) {
          queue ||= new QueueService(new TranscodingJobsService(db));
          const job = {
            ...video.payload,
            jobId: randomUUID(),
            timestamp: Date.now(),
          };
          const [, updated] = await db.query(
            `UPDATE video_entity SET transcoding_status = 'pending'
            WHERE id = $1 AND transcoding_status = 'ready' AND transcription_status = 'waiting_audio'
              AND archived = false AND (subtitle_id IS NULL OR subtitle_id = '')`,
            [video.id],
          );
          if (!updated) continue;
          try {
            await queue.publishJob(job);
          } catch (error) {
            await db.query(
              `UPDATE video_entity SET transcoding_status = 'ready'
              WHERE id = $1 AND transcoding_status = 'pending'`,
              [video.id],
            );
            throw error;
          }
        }
      } else {
        console.log(
          `${video.id}: no extracted audio or retained source; re-upload required`,
        );
      }
    }
  } finally {
    s3.destroy();
    if (db.isInitialized) await db.destroy();
  }
}
void main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
