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
  PermanentJobError,
} from '../types/job.types';
import { S3_CONFIG } from '../config/s3.config';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';

/** HLS files uploaded at once (TRANSCODING_UPLOAD_CONCURRENCY, default 8). */
const uploadConcurrency = (): number => {
  const value = Number(process.env.TRANSCODING_UPLOAD_CONCURRENCY || 8);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error('Invalid TRANSCODING_UPLOAD_CONCURRENCY');
  return value;
};

export class TranscodingService {
  constructor(
    private s3Client: S3Client,
    private signal?: AbortSignal,
    // Called once the final attachments are written, just before encoding.
    private onEncodingStarted?: () => void,
  ) {}

  /**
   * Duration in seconds of a source with a video stream (0 when its container
   * does not record it). Another attempt cannot read a source FFprobe rejects.
   */
  async probeSource(inputPath: string): Promise<number> {
    let stdout: string;
    try {
      ({ stdout } = await this.runProcess(
        process.env.FFPROBE_PATH || 'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'v',
          '-show_entries',
          'stream=codec_type:format=duration',
          '-of',
          'default=noprint_wrappers=1',
          inputPath,
        ],
      ));
    } catch (error) {
      // Aborted, killed or missing binary: not the source's fault, retryable.
      if (typeof (error as { exitCode?: unknown }).exitCode !== 'number')
        throw error;
      throw new PermanentJobError(
        'invalid_source',
        `Unreadable video source: ${(error as Error).message}`.slice(0, 2000),
      );
    }
    const lines = stdout.split('\n').map((line) => line.trim());
    if (!lines.includes('codec_type=video'))
      throw new PermanentJobError(
        'invalid_source',
        'Source has no video stream',
      );
    const duration = lines.find((line) => line.startsWith('duration='));
    return Math.floor(Number.parseFloat(duration?.slice(9) || '') || 0);
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
   * Transcode video to HLS format with multiple quality variants. One FFmpeg
   * process decodes the source once and feeds one output per rendition, each
   * with its own scaling, encoders and HLS muxer (<name>.m3u8, <name><N>.ts).
   * Keyframes are forced every 5 s with scene cuts disabled, so the renditions
   * share their segment boundaries (ABR switching). FFMPEG_THREADS is the
   * thread count of EACH x264 encoder: 3 x FFMPEG_THREADS encoding threads,
   * plus FFmpeg's automatic decoding and scaling threads.
   */
  async transcodeVideoHLS(inputPath: string, outputDir: string): Promise<void> {
    console.log('Starting HLS transcoding...');

    const hasAudioTrack = await this.hasAudio(inputPath);
    console.log(`   Audio: ${hasAudioTrack ? 'Yes' : 'No'}`);

    await this.runProcess(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y',
      '-i',
      inputPath,
      ...HLS_VARIANTS.flatMap((variant) => [
        '-c:v',
        'libx264',
        '-b:v',
        variant.bitrate,
        '-vf',
        `scale=${variant.scale}:force_original_aspect_ratio=decrease,pad=${variant.scale}:(ow-iw)/2:(oh-ih)/2`,
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
        ...(hasAudioTrack
          ? ['-c:a', 'aac', '-ar', '48000', '-b:a', '128k']
          : ['-an']),
        // Source subtitle/data tracks would add files the proxy never serves,
        // and a bitmap subtitle would fail every rendition.
        '-sn',
        '-dn',
        path.join(outputDir, `${variant.name}.m3u8`),
      ]),
    ]);
    console.log(
      `  ${HLS_VARIANTS.map((variant) => variant.name).join(', ')} completed`,
    );

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
   * Extract the audio track to FLAC: losslessly compressed 16-bit PCM with the
   * same samples as the former WAV (44.1 kHz stereo), typically half its size.
   */
  async extractAudioFlac(inputPath: string, outputPath: string): Promise<void> {
    await this.runProcess(process.env.FFMPEG_PATH || 'ffmpeg', [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-acodec',
      'flac',
      '-sample_fmt',
      's16',
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
   * Upload all HLS files to S3, TRANSCODING_UPLOAD_CONCURRENCY (8) at a time,
   * and master.m3u8 last, once every file it references is stored. After a
   * failure or an abort no upload starts, and the uploads in flight settle
   * before the first error is thrown.
   */
  async uploadHLSFiles(hlsDir: string, videoId: string): Promise<number> {
    const concurrency = uploadConcurrency();
    console.log('Uploading HLS segments to S3...');
    const master = path.join(hlsDir, 'master.m3u8');
    const files: string[] = [];
    let hasMaster = false;
    for await (const filePath of this.walk(hlsDir)) {
      if (filePath === master) hasMaster = true;
      else files.push(filePath);
    }
    files.sort();

    let fileCount = 0;
    const upload = async (filePath: string) => {
      await this.uploadFile(
        filePath,
        S3_CONFIG.mediaBucket,
        `${videoId}/${path.relative(hlsDir, filePath)}`,
        filePath.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp2t',
      );
      fileCount++;
      if (fileCount % 10 === 0) {
        console.log(`   Uploaded ${fileCount} files...`);
      }
    };

    let next = 0;
    let failure: { error: unknown } | undefined;
    const worker = async () => {
      while (!failure && next < files.length) {
        try {
          await upload(files[next++]);
        } catch (error) {
          failure ??= { error };
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(concurrency, files.length) }, worker),
    );
    if (failure) throw failure.error;
    if (hasMaster) await upload(master);

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
    const tempAudioPath = path.join(workDir, 'audio.flac');
    let duration = 0;

    try {
      console.log(`\nStarting transcoding job: ${job.jobId}`);
      console.log(`   Video ID: ${job.videoId}`);
      console.log(`   Title: ${job.title}`);

      // Write input file and create output directory
      if (Buffer.isBuffer(videoBuffer))
        await writeFile(tempInputPath, videoBuffer);
      await mkdir(hlsOutputDir, { recursive: true });

      // Get video duration; an unreadable source fails permanently
      duration = await this.probeSource(tempInputPath);
      console.log(`   Duration: ${duration}s`);

      let generatedSubtitleId: string | undefined;

      // Final attachments first: a video too long to transcode is then played
      // from its source with them (see the backend's source fallback).
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

      const maxDuration = Number(
        process.env.TRANSCODING_MAX_DURATION_SECONDS || 1200,
      );
      if (!Number.isSafeInteger(maxDuration) || maxDuration <= 0)
        throw new Error('Invalid TRANSCODING_MAX_DURATION_SECONDS');
      if (duration > maxDuration)
        throw new PermanentJobError(
          'duration_exceeded',
          `Video duration ${duration} s exceeds TRANSCODING_MAX_DURATION_SECONDS (${maxDuration} s)`,
        );

      // A misconfiguration must not cost a whole encode before failing.
      uploadConcurrency();

      // Transcode to HLS. From here a deadline means the video is too long to
      // transcode, not a stall: the runner reports it permanent.
      this.onEncodingStarted?.();
      await this.transcodeVideoHLS(tempInputPath, hlsOutputDir);

      // Upload HLS files
      await this.uploadHLSFiles(hlsOutputDir, job.videoId);

      // Extract and upload FLAC audio when the source has an audio track
      const hasAudioTrack = await this.hasAudio(tempInputPath);
      const audioKey = `${job.videoId}/audio.flac`;
      if (hasAudioTrack) {
        await this.extractAudioFlac(tempInputPath, tempAudioPath);
        await this.uploadFile(
          tempAudioPath,
          S3_CONFIG.mediaBucket,
          audioKey,
          'audio/flac',
        );
        console.log(`FLAC audio uploaded: ${audioKey}`);
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
        duration,
        subtitle_id: null,
        error: (error instanceof Error ? error.message : String(error)).slice(
          -2000,
        ),
        processedAt: Date.now(),
        ...(error instanceof PermanentJobError
          ? { permanent: true, reason: error.reason }
          : {}),
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
    const { size } = await stat(filePath);
    const controller = new AbortController();
    const abort = () => controller.abort();
    this.signal?.addEventListener('abort', abort, { once: true });
    const body = createReadStream(filePath);
    // Read errors reject the upload below; an unhandled stream error would kill the worker.
    body.on('error', () => {});
    try {
      await new Upload({
        client: this.s3Client,
        queueSize: 1,
        abortController: controller,
        params: {
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentLength: size,
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
          reject(
            Object.assign(
              new Error(`${command} exited with code ${code}: ${stderr}`),
              { exitCode: code },
            ),
          );
      });
    });
  }
}
