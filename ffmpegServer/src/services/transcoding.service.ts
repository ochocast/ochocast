import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import {
  mkdir,
  writeFile,
  readFile,
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

export class TranscodingService {
  constructor(private s3Client: S3Client) {}

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
    await Promise.all(
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

  async transcribeAudioToVtt(audioKey: string): Promise<string> {
    const transcriptUrl =
      process.env.TRANSCRIPT_API_URL ||
      process.env.TRANSCRIPTION_API_URL ||
      'http://transcript:8080/v1/audio/transcriptions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (process.env.TRANSCRIPT_API_KEY) {
      headers.Authorization = `Bearer ${process.env.TRANSCRIPT_API_KEY}`;
    }

    const response = await fetch(transcriptUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        audio_id: audioKey,
        model: process.env.TRANSCRIPT_MODEL || 'whisper-1',
        response_format: 'vtt',
        ...(process.env.TRANSCRIPT_LANGUAGE
          ? { language: process.env.TRANSCRIPT_LANGUAGE }
          : {}),
      }),
    });

    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `Transcript API returned ${response.status}: ${body || response.statusText}`,
      );
    }

    return body.startsWith('WEBVTT') ? body : `WEBVTT\n\n${body.trim()}\n`;
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
      const fileContent = await readFile(filePath);
      const relativePath = path.relative(hlsDir, filePath);
      const contentType = filePath.endsWith('.m3u8')
        ? 'application/vnd.apple.mpegurl'
        : 'video/mp2t';

      await new Upload({
        client: this.s3Client,
        params: {
          Bucket: S3_CONFIG.mediaBucket,
          Key: `${videoId}/${relativePath}`,
          Body: fileContent,
          ContentType: contentType,
          CacheControl: 'max-age=31536000',
        },
      }).done();

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
    videoBuffer: Buffer,
    miniatureBuffer?: Buffer,
    subtitleBuffer?: Buffer,
  ): Promise<VideoTranscodingResult> {
    const tempInputPath = path.join(tmpdir(), `${job.jobId}-input.mp4`);
    const hlsOutputDir = path.join(tmpdir(), `${job.jobId}-hls`);
    const tempMiniaturePath = path.join(tmpdir(), `${job.jobId}-miniature.jpg`);
    const tempAudioPath = path.join(tmpdir(), `${job.jobId}-audio.wav`);

    try {
      console.log(`\nStarting transcoding job: ${job.jobId}`);
      console.log(`   Video ID: ${job.videoId}`);
      console.log(`   Title: ${job.title}`);
      console.log(
        `   File size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`,
      );

      // Write input file and create output directory
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
      let generatedSubtitleId: string | null = null;
      if (hasAudioTrack) {
        await this.extractAudioWav(tempInputPath, tempAudioPath);
        const audioContent = await readFile(tempAudioPath);
        await new Upload({
          client: this.s3Client,
          params: {
            Bucket: S3_CONFIG.mediaBucket,
            Key: audioKey,
            Body: audioContent,
            ContentType: 'audio/wav',
            CacheControl: 'max-age=31536000',
          },
        }).done();
        console.log(`WAV audio uploaded: ${audioKey}`);
      }

      // Process and upload miniature
      await this.processMiniature(
        miniatureBuffer,
        tempInputPath,
        tempMiniaturePath,
      );

      if (job.miniature_id) {
        const miniatureContent = await readFile(tempMiniaturePath);
        await new Upload({
          client: this.s3Client,
          params: {
            Bucket: S3_CONFIG.miniatureBucket,
            Key: job.miniature_id,
            Body: miniatureContent,
            ContentType: 'image/jpeg',
            CacheControl: 'max-age=31536000',
          },
        }).done();
        console.log(`Miniature uploaded: ${job.miniature_id}`);
      }

      // Upload subtitle if provided
      if (subtitleBuffer && job.subtitle_id) {
        await new Upload({
          client: this.s3Client,
          params: {
            Bucket: S3_CONFIG.mediaBucket,
            Key: job.subtitle_id,
            Body: subtitleBuffer,
            ContentType: 'text/vtt',
            CacheControl: 'max-age=31536000',
          },
        }).done();
        console.log(`Subtitle uploaded: ${job.subtitle_id}`);
        generatedSubtitleId = job.subtitle_id;
      } else if (hasAudioTrack && job.subtitle_id) {
        const vtt = await this.transcribeAudioToVtt(audioKey);
        await new Upload({
          client: this.s3Client,
          params: {
            Bucket: S3_CONFIG.mediaBucket,
            Key: job.subtitle_id,
            Body: Buffer.from(vtt, 'utf8'),
            ContentType: 'text/vtt',
            CacheControl: 'max-age=31536000',
          },
        }).done();
        generatedSubtitleId = job.subtitle_id;
        console.log(`Subtitle generated by transcription: ${job.subtitle_id}`);
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
        subtitle_id: generatedSubtitleId,
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
        error: error instanceof Error ? error.message : String(error),
        processedAt: Date.now(),
      };
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
      const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
      child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else
          reject(new Error(`${command} exited with code ${code}: ${stderr}`));
      });
    });
  }
}
