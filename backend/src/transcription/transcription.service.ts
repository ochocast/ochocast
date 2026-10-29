import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { toWebVtt } from './webvtt';

const LOCK = 1791540000;
// Whisper statuses caused by the requested audio itself: too large, missing or
// undecodable. Any other refusal would fail every video of the batch alike.
const AUDIO_FAILURES = new Set([413, 422, 500]);

/** The worker, the network or the configuration failed, not this video. */
class WorkerFault extends Error {}

function checkEndpoint(url: string) {
  const parsed = new URL(url);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  )
    throw new Error('Invalid transcription URL');
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
    throw new Error('Transcription endpoints require HTTPS in production');
}

@Injectable()
export class TranscriptionService {
  readonly enabled = process.env.TRANSCRIPTION_ENABLED === 'true';
  private readonly logger = new Logger(TranscriptionService.name);
  private readonly apiUrl = process.env.TRANSCRIPTION_API_URL?.replace(
    /\/$/,
    '',
  );
  private readonly startUrl = process.env.WORKER_START_URL;
  private readonly stopUrl = process.env.WORKER_STOP_URL;
  private readonly controlToken = process.env.WORKER_CONTROL_TOKEN;
  private readonly apiKey = process.env.TRANSCRIPT_API_KEY;
  private readonly timeoutMs = Number(
    process.env.TRANSCRIPTION_TIMEOUT_MS || 1_800_000,
  );
  private readonly healthRetries = Number(
    process.env.WORKER_HEALTH_RETRIES || 120,
  );
  private readonly healthDelay = Number(
    process.env.WORKER_HEALTH_DELAY_MS || 5000,
  );
  private readonly batchSize = Number(
    process.env.TRANSCRIPTION_BATCH_SIZE || 20,
  );
  private running = false;
  private whisperDispatcher: { destroy(): Promise<void> } | undefined;

  constructor(
    private readonly db: DataSource,
    @Inject('s3Client') private readonly s3: S3Client,
  ) {
    // recover() also runs while transcription is disabled: the stop endpoint
    // and its token are checked in every mode.
    if (this.stopUrl) {
      if (!this.controlToken || this.controlToken.length < 32)
        throw new Error(
          'On-demand transcription requires WORKER_CONTROL_TOKEN (>=32 characters)',
        );
      checkEndpoint(this.stopUrl);
    }
    if (!this.enabled) return;
    if (!this.apiUrl || !this.apiKey || this.apiKey.length < 32)
      throw new Error(
        'Transcription requires TRANSCRIPTION_API_URL and TRANSCRIPT_API_KEY (>=32 characters)',
      );
    if (Boolean(this.startUrl) !== Boolean(this.stopUrl))
      throw new Error(
        'WORKER_START_URL and WORKER_STOP_URL must be configured together',
      );
    if (process.env.NODE_ENV === 'production' && !this.startUrl)
      throw new Error(
        'Production transcription requires the on-demand worker lifecycle',
      );
    for (const url of [this.apiUrl, this.startUrl].filter(Boolean))
      checkEndpoint(url);
    // Node's default fetch cuts a response after 300 s, before a long
    // transcription ends. The request's abort signal is its only deadline, so a
    // timeout always surfaces as a TimeoutError. Whisper requests only.
    const { Agent } = require('undici');
    this.whisperDispatcher = new Agent({ headersTimeout: 0, bodyTimeout: 0 });
    for (const number of [
      this.timeoutMs,
      this.healthRetries,
      this.healthDelay,
      this.batchSize,
    ]) {
      if (!Number.isSafeInteger(number) || number < 1)
        throw new Error('Invalid transcription limits');
    }
  }

  async run() {
    if (!this.enabled || this.running) return { processed: 0, failed: 0 };
    return this.locked(async (runner) => {
      await this.stopOrphan(runner);
      // No other batch runs under this lock: a video still processing was
      // interrupted (crash, deploy). Its attempt counts, and its page stops
      // waiting; it is retried below while attempts remain.
      await runner.query(
        `UPDATE video_entity SET transcription_status = 'failed',
        transcription_error = 'Transcription interrupted'
        WHERE transcription_status = 'processing'`,
      );
      const videos = await runner.query(
        `SELECT id, audio_key FROM video_entity
        WHERE archived = false AND transcoding_status = 'ready'
          AND (subtitle_id IS NULL OR subtitle_id = '') AND audio_key IS NOT NULL
          AND transcription_status IN ('pending', 'failed')
          AND transcription_attempts < 3
          AND (transcription_retry_at IS NULL OR transcription_retry_at <= now())
        ORDER BY transcription_attempts, "createdAt" LIMIT $1`,
        [this.batchSize],
      );
      const summary = { processed: 0, failed: 0 };
      if (!videos.length) return summary;
      try {
        if (this.startUrl) {
          // Mark before the HTTP call: a timeout can still have started the VM.
          await runner.query(
            'UPDATE transcription_runtime SET worker_requested = true WHERE id = 1',
          );
          await this.control(this.startUrl);
        }
        await this.waitForWorker();
        for (const video of videos) {
          try {
            const [, claimed] = await runner.query(
              `UPDATE video_entity SET transcription_status = 'processing',
              transcription_attempts = transcription_attempts + 1, transcription_error = NULL
              WHERE id = $1 AND archived = false AND (subtitle_id IS NULL OR subtitle_id = '') RETURNING id`,
              [video.id],
            );
            if (!claimed) continue;
            const audioUrl = await getSignedUrl(
              this.s3,
              new GetObjectCommand({
                Bucket: process.env.STOCK_MEDIA_BUCKET,
                Key: video.audio_key,
              }),
              { expiresIn: 3600 },
            );
            const data = await this.transcribe(audioUrl);
            const vtt = toWebVtt(data.segments);
            const key = `subtitle-auto-${video.id}.vtt`;
            if (vtt)
              await this.s3.send(
                new PutObjectCommand({
                  Bucket: process.env.STOCK_MEDIA_BUCKET,
                  Key: key,
                  Body: vtt,
                  ContentType: 'text/vtt',
                }),
              );
            // A manually attached subtitle always takes precedence.
            const [, attached] = await runner.query(
              `UPDATE video_entity SET subtitle_id = $2,
              transcription_status = $3, transcription_error = NULL, transcription_retry_at = NULL,
              "updatedAt" = now() WHERE id = $1 AND archived = false
              AND (subtitle_id IS NULL OR subtitle_id = '') RETURNING id`,
              [video.id, vtt ? key : null, vtt ? 'ready' : 'no_speech'],
            );
            if (!attached) {
              if (vtt)
                await this.s3.send(
                  new DeleteObjectCommand({
                    Bucket: process.env.STOCK_MEDIA_BUCKET,
                    Key: key,
                  }),
                );
              continue;
            }
            summary.processed += 1;
          } catch (error) {
            const message = String(error.message || error).slice(0, 2000);
            if (error instanceof WorkerFault) {
              // Not this video's fault: give its attempt back and stop rather
              // than fail every remaining video alike.
              await runner.query(
                `UPDATE video_entity SET transcription_status = 'pending',
                transcription_attempts = transcription_attempts - 1, transcription_error = $2
                WHERE id = $1 AND transcription_status = 'processing'`,
                [video.id, message],
              );
              this.logger.warn(
                `Transcription batch stopped at ${video.id}: ${error.message}`,
              );
              break;
            }
            summary.failed += 1;
            await runner.query(
              `UPDATE video_entity SET transcription_status = 'failed',
              transcription_error = $2, transcription_retry_at = now() + interval '1 hour'
              WHERE id = $1 AND (subtitle_id IS NULL OR subtitle_id = '')`,
              [video.id, message],
            );
            this.logger.warn(
              `Transcription failed for ${video.id}: ${error.message}`,
            );
            // The worker still processes the abandoned request: stop here.
            if (error.name === 'TimeoutError') break;
          }
        }
      } finally {
        await this.stopOrphan(runner);
      }
      this.logger.log(
        `Transcription batch: ${summary.processed} processed, ${summary.failed} failed`,
      );
      return summary;
    });
  }

  async recover() {
    if (!this.stopUrl || !this.controlToken || this.running) return;
    await this.locked((runner) => this.stopOrphan(runner));
  }

  async onModuleDestroy() {
    await this.whisperDispatcher?.destroy();
  }

  private async locked<T>(
    action: (runner: QueryRunner) => Promise<T>,
  ): Promise<T | undefined> {
    this.running = true;
    const runner = this.db.createQueryRunner();
    let acquired = false;
    try {
      await runner.connect();
      const [row] = await runner.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [LOCK],
      );
      acquired = row.acquired;
      if (!acquired) return;
      return await action(runner);
    } finally {
      try {
        if (acquired)
          await runner.query('SELECT pg_advisory_unlock($1)', [LOCK]);
      } finally {
        await runner.release();
        this.running = false;
      }
    }
  }

  private async stopOrphan(runner: QueryRunner) {
    if (!this.stopUrl) return;
    const [runtime] = await runner.query(
      'SELECT worker_requested FROM transcription_runtime WHERE id = 1',
    );
    if (!runtime?.worker_requested) return;
    await this.control(this.stopUrl);
    await runner.query(
      'UPDATE transcription_runtime SET worker_requested = false WHERE id = 1',
    );
  }

  /** Whisper's verbose JSON. A WorkerFault is not caused by this audio. */
  private async transcribe(audioUrl: string) {
    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: audioUrl,
          language: 'fr',
          response_format: 'verbose_json',
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
        dispatcher: this.whisperDispatcher,
      } as RequestInit);
      if (response.ok) return await response.json();
    } catch (error) {
      // A timeout counts against the video: its audio may be too long.
      if (error.name === 'TimeoutError') throw error;
      throw new WorkerFault(`Whisper request failed: ${error.message}`);
    }
    const message = `Whisper HTTP ${response.status}`;
    throw AUDIO_FAILURES.has(response.status)
      ? new Error(message)
      : new WorkerFault(message);
  }

  private async control(url: string) {
    let lastError: Error;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.controlToken}` },
          signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok)
          throw new Error(`Worker lifecycle HTTP ${response.status}`);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 2)
          await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw lastError;
  }

  private async waitForWorker() {
    for (let attempt = 0; attempt < this.healthRetries; attempt++) {
      let response: Response | undefined;
      try {
        response = await fetch(`${this.apiUrl}/health`, {
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
      if (response?.ok) return;
      if (response?.status === 500)
        throw new Error('Transcription worker failed to load its model');
      if (attempt + 1 < this.healthRetries)
        await new Promise((resolve) => setTimeout(resolve, this.healthDelay));
    }
    throw new Error('Transcription worker did not become ready');
  }
}
