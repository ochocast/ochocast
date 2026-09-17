import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { spawn } from 'node:child_process';
import { S3_CONFIG } from '../config/s3.config';

// Canonical output format used when normalizing segments so they can be
// concatenated cleanly.
const TARGET_WIDTH = 1280;
const TARGET_HEIGHT = 720;
const TARGET_FPS = 30;

/**
 * US-3 (pass 2) — Robust concatenation of recording segments.
 *
 * WebRTC-origin MP4 files carry non-monotonic / offset timestamps and may
 * differ in resolution or audio presence. A plain `-c copy` concat therefore
 * produces a broken output (wrong duration, dropped frames). To fix this each
 * segment is first re-encoded to a canonical format (fixed resolution, constant
 * frame rate, regenerated timestamps, a guaranteed audio track), then the
 * uniform segments are concatenated with the concat demuxer.
 */
export class MergeService {
  constructor(private s3Client: S3Client) {}

  async merge(
    sourceKeys: string[],
    targetKey: string,
  ): Promise<{ duration: number }> {
    const workDir = await mkdtemp(path.join(tmpdir(), 'merge-'));
    try {
      // 1. Download every source segment (in parallel).
      const rawFiles = await Promise.all(
        sourceKeys.map(async (key, i) => {
          const buffer = await this.downloadFromS3(key);
          const localPath = path.join(workDir, `raw-${i}.mp4`);
          await writeFile(localPath, buffer);
          return localPath;
        }),
      );

      // 2. Normalize each segment to the canonical format (sequential: each
      //    re-encode is CPU-bound and the worker handles one job at a time).
      const normalized: string[] = [];
      for (let i = 0; i < rawFiles.length; i++) {
        const out = path.join(workDir, `norm-${i}.mp4`);
        await this.normalize(rawFiles[i], out);
        normalized.push(out);
      }

      // 3. Concatenate the uniform segments (stream copy is safe now).
      const listPath = path.join(workDir, 'list.txt');
      await writeFile(
        listPath,
        normalized.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'),
      );
      const outputPath = path.join(workDir, 'merged.mp4');
      await this.runProcess(process.env.FFMPEG_PATH || 'ffmpeg', [
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
      ]);

      // 4. Probe duration and upload (streamed).
      const duration = await this.getDuration(outputPath);
      await new Upload({
        client: this.s3Client,
        params: {
          Bucket: S3_CONFIG.mediaBucket,
          Key: targetKey,
          Body: createReadStream(outputPath),
          ContentType: 'video/mp4',
        },
      }).done();

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
  private async normalize(input: string, output: string): Promise<void> {
    const hasAudio = await this.hasAudio(input);
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';

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
    if (!hasAudio) args.push('-shortest');
    args.push(output);

    await this.runProcess(ffmpeg, args);
  }

  private async hasAudio(input: string): Promise<boolean> {
    try {
      const { stdout } = await this.runProcess(
        process.env.FFPROBE_PATH || 'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'a',
          '-show_entries',
          'stream=index',
          '-of',
          'csv=p=0',
          input,
        ],
      );
      return stdout.trim() !== '';
    } catch {
      return false;
    }
  }

  private async downloadFromS3(key: string): Promise<Buffer> {
    const response = await this.s3Client.send(
      new GetObjectCommand({ Bucket: S3_CONFIG.mediaBucket, Key: key }),
    );
    const stream = response.Body as NodeJS.ReadableStream;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  private async getDuration(inputPath: string): Promise<number> {
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
      );
      return Math.floor(Number.parseFloat(stdout) || 0);
    } catch {
      return 0;
    }
  }

  private runProcess(
    command: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else
          reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      });
    });
  }
}
