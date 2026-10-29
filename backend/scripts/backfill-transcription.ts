import 'reflect-metadata';
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import db from '../src/config/typeorm.config';
import { createS3Client } from '../src/s3.module';

// Read-only by default. --enqueue marks videos with existing audio as pending.
// It never requeues a published video or starts a VM.
// The Whisper worker refuses larger audio (its TRANSCRIPT_MAX_AUDIO_BYTES).
const maxAudioBytes = Number(
  process.env.TRANSCRIPT_MAX_AUDIO_BYTES || 512 * 1024 * 1024,
);

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
        WHERE "videoId" = v.id AND status IN ('ready', 'failed') LIMIT 1) j ON true
      WHERE v.archived = false AND v.transcoding_status = 'ready'
        AND (v.subtitle_id IS NULL OR v.subtitle_id = '')
        AND v.transcription_status = 'waiting_audio' ORDER BY v."createdAt"`);
    // The object's size, or undefined when it does not exist.
    const size = async (key: string) => {
      try {
        const head = await s3.send(
          new HeadObjectCommand({
            Bucket: process.env.STOCK_MEDIA_BUCKET,
            Key: key,
          }),
        );
        return head.ContentLength ?? 0;
      } catch (error) {
        if (error.$metadata?.httpStatusCode === 404) return undefined;
        throw error; // Never mistake invalid permissions for a missing source.
      }
    };
    for (const video of videos) {
      let audioKey: string | undefined;
      let audioBytes = 0;
      for (const extension of ['flac', 'wav']) {
        const candidate = `${video.id}/audio.${extension}`;
        const bytes = await size(candidate);
        if (bytes !== undefined) {
          audioKey = candidate;
          audioBytes = bytes;
          break;
        }
      }
      if (audioKey && audioBytes > maxAudioBytes) {
        // A former WAV passes the limit after about 50 minutes: queuing it
        // would only spend the video's nightly attempts.
        console.log(
          `${video.id}: ${audioKey} exceeds the Whisper download limit; left unchanged`,
        );
      } else if (audioKey) {
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
        (await size(video.payload.originalKey)) !== undefined
      ) {
        // Requeueing the original FFmpeg job would set a published video back
        // to pending and hide it while it is re-encoded. Until an audio-only
        // worker exists, leave the published video untouched.
        console.log(
          `${video.id}: retained source requires audio-only backfill; left unchanged`,
        );
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
