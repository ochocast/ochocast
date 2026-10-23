import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { toWebVtt } from './webvtt';

const LOCK = 1791540000;

@Injectable()
export class TranscriptionService {
  readonly enabled = process.env.TRANSCRIPTION_ENABLED === 'true';
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly apiUrl = process.env.TRANSCRIPTION_API_URL?.replace(/\/$/, '');
  private readonly startUrl = process.env.WORKER_START_URL;
  private readonly stopUrl = process.env.WORKER_STOP_URL;
  private readonly controlToken = process.env.WORKER_CONTROL_TOKEN;
  private readonly apiKey = process.env.TRANSCRIPT_API_KEY;
  private readonly timeoutMs = Number(process.env.TRANSCRIPTION_TIMEOUT_MS || 1_800_000);
  private readonly healthRetries = Number(process.env.WORKER_HEALTH_RETRIES || 120);
  private readonly healthDelay = Number(process.env.WORKER_HEALTH_DELAY_MS || 5000);
  private readonly batchSize = Number(process.env.TRANSCRIPTION_BATCH_SIZE || 20);
  private running = false;

  constructor(
    private readonly db: DataSource,
    @Inject('s3Client') private readonly s3: S3Client,
  ) {
    if (!this.enabled) return;
    if (!this.apiUrl || !this.apiKey || this.apiKey.length < 32)
      throw new Error('Transcription requires TRANSCRIPTION_API_URL and TRANSCRIPT_API_KEY (>=32 characters)');
    if (Boolean(this.startUrl) !== Boolean(this.stopUrl))
      throw new Error('WORKER_START_URL and WORKER_STOP_URL must be configured together');
    if (process.env.NODE_ENV === 'production' && !this.startUrl)
      throw new Error('Production transcription requires the on-demand worker lifecycle');
    if (this.startUrl && (!this.controlToken || this.controlToken.length < 32))
      throw new Error('On-demand transcription requires WORKER_CONTROL_TOKEN (>=32 characters)');
    for (const url of [this.apiUrl, this.startUrl, this.stopUrl].filter(Boolean)) {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
        throw new Error('Invalid transcription URL');
      if (url !== this.apiUrl && process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
        throw new Error('Worker control functions require HTTPS');
    }
    for (const number of [this.timeoutMs, this.healthRetries, this.healthDelay, this.batchSize]) {
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid transcription limits');
    }
  }

  async run() {
    if (!this.enabled || this.running) return { processed: 0, failed: 0 };
    return this.locked(async (runner) => {
      await this.stopOrphan(runner);
      const videos = await runner.query(`SELECT id, audio_key FROM video_entity
        WHERE archived = false AND transcoding_status = 'ready'
          AND (subtitle_id IS NULL OR subtitle_id = '') AND audio_key IS NOT NULL
          AND transcription_status IN ('pending', 'failed', 'processing')
          AND (transcription_retry_at IS NULL OR transcription_retry_at <= now())
        ORDER BY "createdAt" LIMIT $1`, [this.batchSize]);
      const summary = { processed: 0, failed: 0 };
      if (!videos.length) return summary;
      try {
        if (this.startUrl) {
          // Mark before the HTTP call: a timeout can still have started the VM.
          await runner.query('UPDATE transcription_runtime SET worker_requested = true WHERE id = 1');
          await this.control(this.startUrl);
        }
        await this.waitForWorker();
        for (const video of videos) {
          try {
            await runner.query(`UPDATE video_entity SET transcription_status = 'processing',
              transcription_attempts = transcription_attempts + 1, transcription_error = NULL
              WHERE id = $1 AND (subtitle_id IS NULL OR subtitle_id = '')`, [video.id]);
            const audioUrl = await getSignedUrl(this.s3, new GetObjectCommand({
              Bucket: process.env.STOCK_MEDIA_BUCKET, Key: video.audio_key,
            }), { expiresIn: 3600 });
            const response = await fetch(`${this.apiUrl}/v1/audio/transcriptions`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ audio_url: audioUrl, language: 'fr', response_format: 'verbose_json' }),
              signal: AbortSignal.timeout(this.timeoutMs),
            });
            if (!response.ok) throw new Error(`Whisper HTTP ${response.status}`);
            const data = await response.json();
            const vtt = toWebVtt(data.segments);
            const key = `subtitle-auto-${video.id}.vtt`;
            if (vtt) await this.s3.send(new PutObjectCommand({
              Bucket: process.env.STOCK_MEDIA_BUCKET, Key: key, Body: vtt, ContentType: 'text/vtt',
            }));
            // A manually attached subtitle always takes precedence.
            await runner.query(`UPDATE video_entity SET subtitle_id = $2,
              transcription_status = $3, transcription_error = NULL, transcription_retry_at = NULL,
              "updatedAt" = now() WHERE id = $1 AND archived = false
              AND (subtitle_id IS NULL OR subtitle_id = '')`,
            [video.id, vtt ? key : null, vtt ? 'ready' : 'no_speech']);
            summary.processed += 1;
          } catch (error) {
            summary.failed += 1;
            await runner.query(`UPDATE video_entity SET transcription_status = 'failed',
              transcription_error = $2, transcription_retry_at = now() + interval '1 hour'
              WHERE id = $1 AND (subtitle_id IS NULL OR subtitle_id = '')`,
            [video.id, String(error.message || error).slice(0, 2000)]);
            this.logger.warn(`Transcription failed for ${video.id}: ${error.message}`);
          }
        }
      } finally {
        await this.stopOrphan(runner);
      }
      this.logger.log(`Transcription batch: ${summary.processed} processed, ${summary.failed} failed`);
      return summary;
    });
  }

  async recover() {
    if (!this.enabled || this.running) return;
    await this.locked((runner) => this.stopOrphan(runner));
  }

  private async locked<T>(action: (runner: QueryRunner) => Promise<T>): Promise<T | undefined> {
    this.running = true;
    const runner = this.db.createQueryRunner();
    let acquired = false;
    try {
      await runner.connect();
      const [row] = await runner.query('SELECT pg_try_advisory_lock($1) AS acquired', [LOCK]);
      acquired = row.acquired;
      if (!acquired) return;
      return await action(runner);
    } finally {
      try {
        if (acquired) await runner.query('SELECT pg_advisory_unlock($1)', [LOCK]);
      } finally {
        await runner.release();
        this.running = false;
      }
    }
  }

  private async stopOrphan(runner: QueryRunner) {
    if (!this.stopUrl) return;
    const [runtime] = await runner.query('SELECT worker_requested FROM transcription_runtime WHERE id = 1');
    if (!runtime?.worker_requested) return;
    await this.control(this.stopUrl);
    await runner.query('UPDATE transcription_runtime SET worker_requested = false WHERE id = 1');
  }

  private async control(url: string) {
    let lastError: Error;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST', headers: { Authorization: `Bearer ${this.controlToken}` },
          signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok) throw new Error(`Worker lifecycle HTTP ${response.status}`);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw lastError;
  }

  private async waitForWorker() {
    for (let attempt = 0; attempt < this.healthRetries; attempt++) {
      try {
        const response = await fetch(`${this.apiUrl}/health`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) return;
      } catch {}
      if (attempt + 1 < this.healthRetries)
        await new Promise((resolve) => setTimeout(resolve, this.healthDelay));
    }
    throw new Error('Transcription worker did not become ready');
  }
}
