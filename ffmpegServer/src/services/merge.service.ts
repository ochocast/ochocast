import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { S3_CONFIG } from '../config/s3.config';
import { PermanentJobError } from '../types/job.types';
import { maxSourceBytes, TranscodingService } from './transcoding.service';

// Canonical output format used when normalizing segments so they can be
// concatenated cleanly.
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 30;

/**
 * US-3 — Robust concatenation of recording segments.
 *
 * WebRTC-origin MP4 files carry non-monotonic / offset timestamps and may
 * differ in resolution or audio presence. A plain `-c copy` concat therefore
 * produces a broken output (wrong duration, dropped frames). Each segment is
 * first re-encoded to a canonical format (fixed resolution, constant frame
 * rate, regenerated timestamps, a guaranteed audio track), then the uniform
 * segments are concatenated with the concat demuxer.
 *
 * Runs in the serverless merge worker: files live under TRANSCODING_WORK_DIR
 * (not /tmp, which is RAM on Scaleway), and `signal` stops every download,
 * ffmpeg process and upload on timeout or shutdown. TRANSCODING_MAX_SOURCE_BYTES
 * bounds all segments together; segments are handled one at a time, so the
 * disk peaks near twice the normalized montage (normalized segments, then the
 * merged copy), never at all raw segments at once.
 *
 * Failures another attempt would hit again on the same bytes (over the size
 * budget, a segment FFprobe cannot read) throw a PermanentJobError.
 */
export class MergeService {
  constructor(private readonly s3Client: S3Client) {}

  async merge(
    sourceKeys: string[],
    targetKey: string,
    signal: AbortSignal,
  ): Promise<{ duration: number }> {
    // 1. Check the whole budget before downloading anything: an oversized
    //    montage fails at once instead of after gigabytes of downloads.
    const maxBytes = maxSourceBytes();
    const sizes = await Promise.all(
      sourceKeys.map((key) => this.sizeOf(key, signal)),
    );
    const total = sizes.reduce((sum, size) => sum + size, 0);
    if (total > maxBytes)
      throw new PermanentJobError(
        'source_too_large',
        `Segments exceed configured size limit (${total} > ${maxBytes} bytes)`,
      );

    const root = process.env.TRANSCODING_WORK_DIR || tmpdir();
    await mkdir(root, { recursive: true });
    const workDir = await mkdtemp(path.join(root, 'merge-'));
    try {
      // 2. One segment at a time: download, probe, normalize to the canonical
      //    format, then delete the raw file before the next download. The
      //    streamed budget still guards against a segment replaced since HEAD.
      const budget = { remaining: maxBytes };
      const normalized: string[] = [];
      for (let i = 0; i < sourceKeys.length; i++) {
        const raw = path.join(workDir, `raw-${i}.mp4`);
        await this.download(sourceKeys[i], raw, budget, signal);
        const { hasAudio } = await this.probe(raw, i, signal);
        const out = path.join(workDir, `norm-${i}.mp4`);
        await this.normalize(raw, out, hasAudio, signal);
        await rm(raw, { force: true });
        normalized.push(out);
      }

      // 3. Concatenate the uniform segments (stream copy is safe now).
      const listPath = path.join(workDir, 'list.txt');
      await writeFile(
        listPath,
        normalized.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
      );
      const outputPath = path.join(workDir, 'merged.mp4');
      await this.runProcess(
        process.env.FFMPEG_PATH || 'ffmpeg',
        [
          '-y',
          '-f',
          'concat',
          '-safe',
          '0',
          '-i',
          listPath,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          outputPath,
        ],
        signal,
      );

      // 4. Probe duration and upload (streamed).
      const duration = await this.getDuration(outputPath, signal);
      await this.upload(targetKey, outputPath, signal);
      return { duration };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  /**
   * Re-encode one segment to the canonical format: fixed resolution (letterboxed
   * to preserve aspect ratio), constant frame rate, regenerated timestamps, and
   * a stereo AAC audio track (a silent one is synthesized if the segment has no
   * audio, so every normalized segment has the same stream layout).
   */
  private async normalize(
    input: string,
    output: string,
    hasAudio: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    const args = ['-y', '-fflags', '+genpts', '-i', input];
    if (!hasAudio) {
      args.push(
        '-f',
        'lavfi',
        '-i',
        'anullsrc=channel_layout=stereo:sample_rate=48000',
      );
    }
    args.push(
      '-map',
      '0:v:0',
      '-map',
      hasAudio ? '0:a:0' : '1:a:0',
      '-vf',
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,` +
        `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1`,
      '-r',
      String(TARGET_FPS),
      '-vsync',
      'cfr',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-ar',
      '48000',
      '-ac',
      '2',
    );
    if (process.env.FFMPEG_THREADS)
      args.push('-threads', process.env.FFMPEG_THREADS);
    if (!hasAudio) args.push('-shortest');
    args.push(output);

    await this.runProcess(process.env.FFMPEG_PATH || 'ffmpeg', args, signal);
  }

  /**
   * Same FFprobe classification as a transcoding source: a segment it cannot
   * read (a truncated MP4 without moov after a brutal stop) or without video
   * is permanent; an abort, a killed probe or a missing binary is not.
   */
  private async probe(
    input: string,
    index: number,
    signal: AbortSignal,
  ): Promise<{ hasAudio: boolean }> {
    try {
      return await new TranscodingService(this.s3Client, signal).probeSource(
        input,
      );
    } catch (error) {
      if (!(error instanceof PermanentJobError)) throw error;
      throw new PermanentJobError(
        error.reason,
        `Segment ${index + 1}: ${error.message}`.slice(0, 2000),
      );
    }
  }

  private async sizeOf(key: string, signal: AbortSignal): Promise<number> {
    const head = await this.s3Client.send(
      new HeadObjectCommand({ Bucket: S3_CONFIG.mediaBucket, Key: key }),
      { abortSignal: signal },
    );
    return head.ContentLength || 0;
  }

  private async download(
    key: string,
    destination: string,
    budget: { remaining: number },
    signal: AbortSignal,
  ): Promise<void> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: S3_CONFIG.mediaBucket, Key: key }),
      { abortSignal: signal },
    );
    const body = response.Body as Readable;
    if (!body) throw new Error('Missing S3 object body');
    // Another attempt would download the same objects: never retried.
    const tooLarge = () =>
      new PermanentJobError(
        'source_too_large',
        'Segments exceed configured size limit',
      );
    if ((response.ContentLength || 0) > budget.remaining) {
      body.destroy();
      throw tooLarge();
    }
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        budget.remaining -= chunk.length;
        callback(budget.remaining < 0 ? tooLarge() : null, chunk);
      },
    });
    await pipeline(body, limiter, createWriteStream(destination), { signal });
  }

  /** Deletes a merged MP4 nobody references any more (montage deleted). */
  async remove(key: string): Promise<void> {
    await this.s3Client.send(
      new DeleteObjectCommand({ Bucket: S3_CONFIG.mediaBucket, Key: key }),
      { abortSignal: AbortSignal.timeout(10000) },
    );
  }

  private async upload(
    key: string,
    file: string,
    signal: AbortSignal,
  ): Promise<void> {
    signal.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    const body = createReadStream(file);
    // Read errors reject the upload below; an unhandled stream error would kill the worker.
    body.on('error', () => undefined);
    try {
      await new Upload({
        client: this.s3Client,
        params: {
          Bucket: S3_CONFIG.mediaBucket,
          Key: key,
          Body: body,
          ContentType: 'video/mp4',
        },
        abortController: controller,
      }).done();
    } finally {
      signal.removeEventListener('abort', abort);
      body.destroy();
    }
  }

  private async getDuration(
    inputPath: string,
    signal: AbortSignal,
  ): Promise<number> {
    try {
      const { stdout } = await this.runProcess(
        process.env.FFPROBE_PATH || 'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          inputPath,
        ],
        signal,
      );
      return Math.floor(Number.parseFloat(stdout) || 0);
    } catch {
      signal.throwIfAborted();
      return 0;
    }
  }

  private runProcess(
    command: string,
    args: string[],
    signal: AbortSignal,
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      signal.throwIfAborted();
      const child = spawn(command, args, { signal, killSignal: 'SIGKILL' });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      // Keep only the tail: ffmpeg is verbose and the error message is at the end.
      child.stderr.on(
        'data',
        (d) => (stderr = (stderr + d.toString()).slice(-4000)),
      );
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else
          reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      });
    });
  }
}
