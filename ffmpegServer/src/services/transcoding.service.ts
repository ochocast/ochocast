import { ObjectStorage } from './object-storage';

import {
  mkdir,
  mkdtemp,
  statfs,
  writeFile,

  readdir,
  stat,
  unlink,
  rm,
} from 'node:fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import sharp from 'sharp';
import {
  VideoTranscodingJob,
  VideoTranscodingResult,
  HLS_VARIANTS,
} from '../types/job.types';
import { S3_CONFIG } from '../config/s3.config';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

export class TranscodingService {
  constructor(private storage: ObjectStorage, private signal: AbortSignal = new AbortController().signal) {}

  /**
   * Get video duration in seconds
   */
  async getVideoDuration(inputPath: string): Promise<number> {
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
    return Number.parseFloat(stdout) || 0;
  }

  /**
   * Check if video has audio track
   */
  async hasAudio(inputPath: string): Promise<boolean> {
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
          inputPath,
        ],
      );
      return stdout.trim() !== '';
    } catch {
      return false;
    }
  }

  /**
   * Transcode a single HLS variant
   */
  async transcodeVariant(
    inputPath: string,
    outputDir: string,
    resolution: string,
    bitrate: string,
    name: string,
    hasAudio: boolean,
  ): Promise<void> {
    const outputOptions = [
      '-y',
      '-threads',
      process.env.FFMPEG_THREADS || '2',
      '-filter_threads',
      '1',
      '-i',
      inputPath,
      '-c:v',
      'libx264',
      '-b:v',
      bitrate,
      '-vf',
      `scale=${resolution}:force_original_aspect_ratio=decrease,pad=${resolution}:(ow-iw)/2:(oh-ih)/2`,
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'fast',
      '-threads',
      process.env.FFMPEG_THREADS || '2',
      '-sc_threshold',
      '0',
      '-force_key_frames',
      'expr:gte(t,n_forced*5)',
      '-hls_time',
      '5',
      '-hls_playlist_type',
      'vod',
      '-hls_flags',
      'independent_segments',
      '-hls_segment_type',
      'mpegts',
    ];

    if (hasAudio) {
      outputOptions.push('-c:a', 'aac', '-ar', '48000', '-b:a', '128k');
    } else {
      outputOptions.push('-an');
    }

    outputOptions.push(path.join(outputDir, `${name}.m3u8`));
    await this.runProcess(process.env.FFMPEG_PATH || 'ffmpeg', outputOptions);
    console.log(`  ${name} completed`);
  }

  /**
   * Transcode video to HLS format with multiple quality variants
   */
  async transcodeVideoHLS(inputPath: string, outputDir: string): Promise<void> {
    console.log('Starting HLS transcoding...');

    const hasAudioTrack = await this.hasAudio(inputPath);
    console.log(`   Audio: ${hasAudioTrack ? 'Yes' : 'No'}`);

    // One encoder at a time; memory and CPU remain bounded per worker.
    for (const variant of HLS_VARIANTS) {
      this.signal.throwIfAborted();
      await this.transcodeVariant(inputPath, outputDir, variant.scale, variant.bitrate, variant.name, hasAudioTrack);
    }

    // Create master playlist
    const masterPlaylistContent = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      ...HLS_VARIANTS.map(
        (variant) =>
          `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(variant.bitrate) * 1000},RESOLUTION=${variant.resolution}\n${variant.name}.m3u8`,
      ),
    ].join('\n');

    await writeFile(path.join(outputDir, 'master.m3u8'), masterPlaylistContent);
    console.log('Master playlist created');
  }

  /**
   * Recursively walk directory
   */
  async *walk(dir: string): AsyncGenerator<string> {
    const files = await readdir(dir);
    for (const file of files) {
      const filePath = path.join(dir, file);
      const fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        yield* this.walk(filePath);
      } else {
        yield filePath;
      }
    }
  }

  /**
   * Generate thumbnail from video
   */
  async generateThumbnail(
    inputPath: string,
    outputPath: string,
  ): Promise<void> {
    await this.runProcess(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y',
      '-ss',
      '0',
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2',
      outputPath,
    ]);
  }

  /**
   * Process miniature/thumbnail
   */
  async processMiniature(
    miniatureBuffer: string | undefined,
    videoPath: string,
    outputPath: string,
  ): Promise<void> {
    if (miniatureBuffer) {
      try {
        await sharp(miniatureBuffer)
          .resize(1280, 720, {
            fit: 'cover',
            position: 'center',
          })
          .jpeg({ quality: 80 })
          .toFile(outputPath);
        console.log('Miniature processed from upload');
        return;
      } catch (error) {
        console.warn(
          `Invalid uploaded miniature, generating one from video: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.generateThumbnail(videoPath, outputPath);
    console.log('Miniature generated from video');
  }

  /**
   * Upload all HLS files to S3
   */
  async uploadHLSFiles(hlsDir: string, prefix: string): Promise<number> {
    const files: string[] = [];
    for await (const file of this.walk(hlsDir)) files.push(file);
    // Publish playlists last so a new master never references missing segments.
    files.sort((a, b) => Number(a.endsWith('.m3u8')) - Number(b.endsWith('.m3u8')));
    for (const file of files) {
      if (path.basename(file) === 'master.m3u8') continue;
      await this.storage.upload(S3_CONFIG.mediaBucket, `${prefix}/${path.relative(hlsDir, file)}`,
        file, file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t', this.signal);
    }
    await this.storage.upload(S3_CONFIG.mediaBucket, `${prefix}/master.m3u8`,
      path.join(hlsDir, 'master.m3u8'), 'application/vnd.apple.mpegurl', this.signal);
    return files.length;
  }

  async processJob(job: VideoTranscodingJob): Promise<VideoTranscodingResult> {
    const root = process.env.TRANSCODING_TMP_DIR || path.join(tmpdir(), 'transcoding');
    await mkdir(root, { recursive: true });
    const dir = await mkdtemp(path.join(root, 'job-'));
    const input = path.join(dir, 'input');
    const hls = path.join(dir, 'hls');
    const thumbnail = path.join(dir, 'thumbnail.jpg');
    const maxSource = Number(process.env.MAX_SOURCE_BYTES || 20 * 1024 ** 3);
    try {
      const disk = await statfs(root);
      const reserve = Number(process.env.MIN_FREE_DISK_BYTES || 1024 ** 3);
      if (disk.bavail * disk.bsize < reserve) throw new Error('Insufficient temporary disk space');
      await this.storage.download(S3_CONFIG.mediaBucket, job.originalKey, input, maxSource, this.signal);
      const size = (await stat(input)).size;
      // Conservative output budget; a dedicated disk/quota is still required for pathological media.
      const remaining = await statfs(root);
      if (remaining.bavail * remaining.bsize < size * 3 + reserve) throw new Error('Insufficient disk space for HLS outputs');
      await mkdir(hls);
      const duration = await this.getVideoDuration(input);
      if (duration <= 0) throw new Error('Invalid or empty video');
      await this.transcodeVideoHLS(input, hls);
      let miniature: string | undefined;
      if (job.miniatureSourceKey) {
        miniature = path.join(dir, 'miniature-source');
        await this.storage.download(S3_CONFIG.miniatureBucket, job.miniatureSourceKey, miniature, 5 * 1024 ** 2, this.signal);
      }
      await this.processMiniature(miniature, input, thumbnail);
      if (job.miniature_id) await this.storage.upload(S3_CONFIG.miniatureBucket, job.miniature_id, thumbnail, 'image/jpeg', this.signal);
      if (job.subtitleSourceKey && job.subtitle_id) {
        const subtitle = path.join(dir, 'subtitle.vtt');
        await this.storage.download(S3_CONFIG.mediaBucket, job.subtitleSourceKey, subtitle, 6 * 1024 ** 2, this.signal);
        await this.storage.upload(S3_CONFIG.mediaBucket, job.subtitle_id, subtitle, 'text/vtt', this.signal);
      }
      // Each attempt gets isolated output keys. Result application selects the successful attempt.
      const outputPrefix = `${job.videoId}/jobs/${job.jobId}/${randomUUID()}`;
      await this.uploadHLSFiles(hls, outputPrefix);
      return { jobId: job.jobId, videoId: job.videoId, success: true, duration,
        media_id: `${outputPrefix}/master.m3u8`, processedAt: Date.now() };
    } catch (error) {
      this.signal.throwIfAborted(); // Lost connection / shutdown: requeue, never publish a terminal failure.
      return { jobId: job.jobId, videoId: job.videoId, success: false, duration: 0,
        error: error instanceof Error ? error.message : String(error), processedAt: Date.now() };
    } finally {
      await this.cleanup([dir]); // Source objects deliberately survive completion and replay.
    }
  }

  /**
   * Cleanup temporary files
   */
  private async cleanup(paths: string[]): Promise<void> {
    for (const p of paths) {
      try {
        const stats = await stat(p).catch(() => null);
        if (stats?.isDirectory()) {
          await rm(p, { recursive: true, force: true });
        } else if (stats?.isFile()) {
          await unlink(p);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private runProcess(
    command: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      this.signal.throwIfAborted();
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      const abort = () => child.kill('SIGKILL');
      this.signal.addEventListener('abort', abort, { once: true });
      const timer = setTimeout(abort, Number(process.env.TRANSCODING_TIMEOUT_MS || 6 * 3600_000));
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout = (stdout + chunk.toString()).slice(-65536)));
      child.stderr.on('data', (chunk) => (stderr = (stderr + chunk.toString()).slice(-65536)));
      child.on('error', reject);
      child.on('close', (code) => {
        clearTimeout(timer);
        this.signal.removeEventListener('abort', abort);
        if (code === 0) resolve({ stdout, stderr });
        else
          reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      });
    });
  }
}
