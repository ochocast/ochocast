import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  mkdir,
  mkdtemp,
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
import { createReadStream } from 'node:fs';

export class TranscodingService {
  constructor(
    private s3Client: S3Client,
    private signal?: AbortSignal,
  ) {}

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
    return Math.floor(Number.parseFloat(stdout) || 0);
  }

  /**
   * Check if video has audio track
   */
  async hasAudio(inputPath: string): Promise<boolean> {
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

    // Transcode all variants in parallel for speed
    const outcomes = await Promise.allSettled(
      HLS_VARIANTS.map((variant) =>
        this.transcodeVariant(
          inputPath,
          outputDir,
          variant.scale,
          variant.bitrate,
          variant.name,
          hasAudioTrack,
        ),
      ),
    );
    // Wait for every encoder before removing the working directory on failure.
    const failed = outcomes.find((outcome) => outcome.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;

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
      '1',
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
   * Extract audio track to WAV format
   */
  async extractAudioWav(inputPath: string, outputPath: string): Promise<void> {
    await this.runProcess(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '44100',
      '-ac',
      '2',
      outputPath,
    ]);
  }

  /**
   * Process miniature/thumbnail
   */
  async processMiniature(
    miniatureBuffer: Buffer | undefined,
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
  async uploadHLSFiles(hlsDir: string, videoId: string): Promise<number> {
    console.log('Uploading HLS segments to S3...');
    let fileCount = 0;

    for await (const filePath of this.walk(hlsDir)) {
      const relativePath = path.relative(hlsDir, filePath);
      const contentType = filePath.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : 'video/mp2t';

      await this.uploadFile(
        filePath,
        S3_CONFIG.mediaBucket,
        `${videoId}/${relativePath}`,
        contentType,
      );

      fileCount++;
      if (fileCount % 10 === 0) {
        console.log(`   Uploaded ${fileCount} files...`);
      }
    }

    console.log(`Uploaded ${fileCount} HLS files`);
    return fileCount;
  }

  /**
   * Convert Buffer stream to Buffer
   */
  async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  /**
   * Main job processing function
   */
  async processJob(
    job: VideoTranscodingJob,
    videoBuffer: Buffer | string,
    miniatureBuffer?: Buffer,
    subtitleBuffer?: Buffer,
    retainSources = false,
  ): Promise<VideoTranscodingResult> {
    const root = process.env.TRANSCODING_WORK_DIR || tmpdir();
    await mkdir(root, { recursive: true });
    const workDir = await mkdtemp(path.join(root, 'encode-'));
    const tempInputPath =
      typeof videoBuffer === 'string'
        ? videoBuffer
        : path.join(workDir, 'input.mp4');
    const hlsOutputDir = path.join(workDir, 'hls');
    const tempMiniaturePath = path.join(workDir, 'miniature.jpg');
    const tempAudioPath = path.join(workDir, 'audio.wav');

    try {
      console.log(`\nStarting transcoding job: ${job.jobId}`);
      console.log(`   Video ID: ${job.videoId}`);
      console.log(`   Title: ${job.title}`);

      // Write input file and create output directory
      if (Buffer.isBuffer(videoBuffer))
        await writeFile(tempInputPath, videoBuffer);
      await mkdir(hlsOutputDir, { recursive: true });

      // Get video duration
      const duration = await this.getVideoDuration(tempInputPath);
      console.log(`   Duration: ${duration}s`);

      // Transcode to HLS
      await this.transcodeVideoHLS(tempInputPath, hlsOutputDir);

      // Upload HLS files
      await this.uploadHLSFiles(hlsOutputDir, job.videoId);

      // Extract and upload WAV audio when the source has an audio track
      const hasAudioTrack = await this.hasAudio(tempInputPath);
      const audioKey = `${job.videoId}/audio.wav`;
      let generatedSubtitleId: string | undefined;
      if (hasAudioTrack) {
        await this.extractAudioWav(tempInputPath, tempAudioPath);
        await this.uploadFile(
          tempAudioPath,
          S3_CONFIG.mediaBucket,
          audioKey,
          'audio/wav',
        );
        console.log(`WAV audio uploaded: ${audioKey}`);
      }

      // Process and upload miniature
      await this.processMiniature(
        miniatureBuffer,
        tempInputPath,
        tempMiniaturePath,
      );

      if (job.miniature_id) {
        await this.uploadFile(
          tempMiniaturePath,
          S3_CONFIG.miniatureBucket,
          job.miniature_id,
          'image/jpeg',
        );
        console.log(`Miniature uploaded: ${job.miniature_id}`);
      }

      // Upload subtitle if provided
      if (subtitleBuffer && job.subtitle_id) {
        const subtitlePath = path.join(workDir, 'subtitle.vtt');
        await writeFile(subtitlePath, subtitleBuffer);
        await this.uploadFile(
          subtitlePath,
          S3_CONFIG.mediaBucket,
          job.subtitle_id,
          'text/vtt',
        );
        console.log(`Subtitle uploaded: ${job.subtitle_id}`);
        generatedSubtitleId = job.subtitle_id;
      }

      const sourceObjects = [
        { bucket: S3_CONFIG.mediaBucket, key: job.originalKey },
        job.miniatureSourceKey
          ? { bucket: S3_CONFIG.miniatureBucket, key: job.miniatureSourceKey }
          : undefined,
        job.subtitleSourceKey
          ? { bucket: S3_CONFIG.mediaBucket, key: job.subtitleSourceKey }
          : undefined,
      ].filter((entry): entry is { bucket: string; key: string } =>
        Boolean(entry),
      );
      if (!retainSources)
        await Promise.all(
          sourceObjects.map(({ bucket, key }) =>
            this.s3Client.send(
              new DeleteObjectCommand({ Bucket: bucket, Key: key }),
            ),
          ),
        );

      // Cleanup temporary files
      await this.cleanup([
        tempInputPath,
        tempMiniaturePath,
        tempAudioPath,
        hlsOutputDir,
      ]);

      console.log(`Job completed successfully: ${job.jobId}\n`);

      return {
        jobId: job.jobId,
        success: true,
        videoId: job.videoId,
        duration,
        ...(generatedSubtitleId ? { subtitle_id: generatedSubtitleId } : {}),
        processedAt: Date.now(),
      };
    } catch (error: unknown) {
      console.error(`Job failed: ${job.jobId}`, error);

      // Cleanup on error
      await this.cleanup([
        tempInputPath,
        tempMiniaturePath,
        tempAudioPath,
        hlsOutputDir,
      ]);

      return {
        jobId: job.jobId,
        success: false,
        videoId: job.videoId,
        duration: 0,
        subtitle_id: null,
        error: (error instanceof Error ? error.message : String(error)).slice(
          -2000,
        ),
        processedAt: Date.now(),
      };
    } finally {
      await this.cleanup([workDir]);
    }
  }

  private async uploadFile(
    filePath: string,
    bucket: string,
    key: string,
    contentType: string,
  ): Promise<void> {
    this.signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.signal?.addEventListener('abort', abort, { once: true });
    const body = createReadStream(filePath);
    try {
      await new Upload({
        client: this.s3Client,
        queueSize: 1,
        abortController: controller,
        params: {
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentLength: (await stat(filePath)).size,
          ContentType: contentType,
          CacheControl: 'max-age=31536000',
        },
      }).done();
    } finally {
      body.destroy();
      this.signal?.removeEventListener('abort', abort);
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
      this.signal?.throwIfAborted();
      const child = spawn(
        command,
        ['-protocol_whitelist', 'file,pipe', ...args],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          signal: this.signal,
          killSignal: 'SIGKILL',
        },
      );
      let stdout = '';
      let stderr = '';
      let processError: Error | undefined;
      child.stdout.on(
        'data',
        (chunk) => (stdout = (stdout + chunk.toString()).slice(-8192)),
      );
      child.stderr.on(
        'data',
        (chunk) => (stderr = (stderr + chunk.toString()).slice(-16384)),
      );
      child.on('error', (error) => {
        processError = error;
      });
      child.on('close', (code) => {
        if (processError) reject(processError);
        else if (code === 0) resolve({ stdout, stderr });
        else
          reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      });
    });
  }
}
