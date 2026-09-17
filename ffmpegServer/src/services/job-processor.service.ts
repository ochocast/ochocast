import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { S3_CONFIG } from '../config/s3.config';
import {
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../types/job.types';
import { TranscodingService } from './transcoding.service';

export class JobProcessorService {
  constructor(private readonly s3: S3Client) {}

  async processJob(
    job: VideoTranscodingJob,
    signal: AbortSignal,
  ): Promise<VideoTranscodingResult> {
    const checkpointKey = `${job.videoId}/_transcoding/${job.jobId}/result.json`;
    const cached = await this.readCheckpoint(checkpointKey, job, signal);
    if (cached) return cached;
    const root = process.env.TRANSCODING_WORK_DIR || tmpdir();
    await mkdir(root, { recursive: true });
    const directory = await mkdtemp(path.join(root, 'source-'));
    try {
      const input = path.join(directory, 'input');
      const maxBytes = Number(
        process.env.TRANSCODING_MAX_SOURCE_BYTES || 5 * 1024 ** 3,
      );
      if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0)
        throw new Error('Invalid TRANSCODING_MAX_SOURCE_BYTES');
      await this.download(
        S3_CONFIG.mediaBucket,
        job.originalKey,
        input,
        maxBytes,
        signal,
      );
      let miniature: Buffer | undefined;
      let subtitle: Buffer | undefined;
      if (job.miniatureSourceKey) {
        const file = path.join(directory, 'miniature');
        await this.download(
          S3_CONFIG.miniatureBucket,
          job.miniatureSourceKey,
          file,
          8 * 1024 ** 2,
          signal,
        );
        miniature = await readFile(file);
      }
      if (job.subtitleSourceKey) {
        const file = path.join(directory, 'subtitle');
        await this.download(
          S3_CONFIG.mediaBucket,
          job.subtitleSourceKey,
          file,
          4 * 1024 ** 2,
          signal,
        );
        subtitle = await readFile(file);
      }
      const result = await new TranscodingService(this.s3, signal).processJob(
        job,
        input,
        miniature,
        subtitle,
        true,
      );
      if (result.success) {
        // Durable checkpoint: a lost callback can be retried without encoding again.
        await this.s3.send(
          new PutObjectCommand({
            Bucket: S3_CONFIG.mediaBucket,
            Key: checkpointKey,
            Body: JSON.stringify(result),
            ContentType: 'application/json',
          }),
          { abortSignal: signal },
        );
      }
      return result;
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  private async readCheckpoint(
    key: string,
    job: VideoTranscodingJob,
    signal: AbortSignal,
  ): Promise<VideoTranscodingResult | undefined> {
    try {
      const object = await this.s3.send(
        new GetObjectCommand({ Bucket: S3_CONFIG.mediaBucket, Key: key }),
        { abortSignal: signal },
      );
      const result = JSON.parse(
        await object.Body!.transformToString(),
      ) as VideoTranscodingResult;
      if (
        result.success !== true ||
        result.jobId !== job.jobId ||
        result.videoId !== job.videoId ||
        !Number.isFinite(result.duration) ||
        result.duration < 0
      ) {
        throw new Error('Invalid transcoding checkpoint');
      }
      return result;
    } catch (error) {
      if (
        (error as { name?: string }).name === 'NoSuchKey' ||
        (error as { $metadata?: { httpStatusCode: number } }).$metadata
          ?.httpStatusCode === 404
      )
        return undefined;
      throw error;
    }
  }

  private async download(
    bucket: string,
    key: string,
    destination: string,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<void> {
    const response = await this.s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
      { abortSignal: signal },
    );
    const body = response.Body as Readable;
    if (!body) throw new Error('Missing S3 object body');
    if ((response.ContentLength || 0) > maxBytes) {
      body.destroy();
      throw new Error('Source exceeds configured size limit');
    }
    let received = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        received += chunk.length;
        callback(
          received > maxBytes
            ? new Error('Source exceeds configured size limit')
            : null,
          chunk,
        );
      },
    });
    await pipeline(body, limiter, createWriteStream(destination), { signal });
  }
}
