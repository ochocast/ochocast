import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import { mkdir, writeFile, readFile, readdir, stat, unlink, rm } from 'node:fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import sharp from 'sharp';
import { VideoTranscodingJob, VideoTranscodingResult, HLS_VARIANTS } from '../types/job.types';
import { S3_CONFIG } from '../config/s3.config';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export class TranscodingService {
  constructor(private s3Client: S3Client) {}

  /**
   * Get video duration in seconds
   */
  async getVideoDuration(inputPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          reject(err);
        } else {
          resolve(Math.floor(metadata.format.duration || 0));
        }
      });
    });
  }

  /**
   * Check if video has audio track
   */
  async hasAudio(inputPath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `"${ffprobeInstaller.path}" -v error -select_streams a -show_entries stream=index -of csv=p=0 "${inputPath}"`
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
    hasAudio: boolean
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const outputOptions = [
        '-c:v libx264',
        `-b:v ${bitrate}`,
        `-vf scale=${resolution}`,
        '-hls_time 5',
        '-hls_playlist_type vod',
        '-hls_flags independent_segments',
        '-hls_segment_type mpegts',
      ];

      if (hasAudio) {
        outputOptions.push('-c:a aac', '-ar 48000', '-b:a 128k');
      } else {
        outputOptions.push('-an'); // No audio
      }

      ffmpeg(inputPath)
        .outputOptions(outputOptions)
        .output(path.join(outputDir, `${name}.m3u8`))
        .on('end', () => {
          console.log(`  ${name} completed`);
          resolve();
        })
        .on('error', (err: Error) => {
          console.error(`  ${name} failed:`, err.message);
          reject(err);
        })
        .on('progress', (progress: { percent?: number }) => {
          const percent = Math.round(progress.percent || 0);
          console.log(`  ${name}: ${percent}%`);
        })
        .run();
    });
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
      HLS_VARIANTS.map(variant =>
        this.transcodeVariant(
          inputPath,
          outputDir,
          variant.scale,
          variant.bitrate,
          variant.name,
          hasAudioTrack
        )
      )
    );

    // Create master playlist
    const masterPlaylistContent = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      ...HLS_VARIANTS.map(variant => 
        `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(variant.bitrate) * 1000},RESOLUTION=${variant.resolution}\n${variant.name}.m3u8`
      )
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
  async generateThumbnail(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .screenshots({
          timestamps: ['10%'],
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: '1280x720',
        })
        .on('end', () => resolve())
        .on('error', reject);
    });
  }

  /**
   * Process miniature/thumbnail
   */
  async processMiniature(
    miniatureBuffer: Buffer | undefined,
    videoPath: string,
    outputPath: string
  ): Promise<void> {
    if (miniatureBuffer) {
      // Process provided miniature
      await sharp(miniatureBuffer)
        .resize(1280, 720, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 80 })
        .toFile(outputPath);
      console.log('Miniature processed from upload');
    } else {
      // Generate from video
      await this.generateThumbnail(videoPath, outputPath);
      console.log('Miniature generated from video');
    }
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
        ? 'application/x-mpegURL'
        : 'video/MP2T';

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
    subtitleBuffer?: Buffer
  ): Promise<VideoTranscodingResult> {
    const tempInputPath = path.join(tmpdir(), `${job.jobId}-input.mp4`);
    const hlsOutputDir = path.join(tmpdir(), `${job.jobId}-hls`);
    const tempMiniaturePath = path.join(tmpdir(), `${job.jobId}-miniature.jpg`);

    try {
      console.log(`\nStarting transcoding job: ${job.jobId}`);
      console.log(`   Video ID: ${job.videoId}`);
      console.log(`   Title: ${job.title}`);
      console.log(`   File size: ${(videoBuffer.length / 1024 / 1024).toFixed(2)} MB`);

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

      // Process and upload miniature
      await this.processMiniature(miniatureBuffer, tempInputPath, tempMiniaturePath);
      
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
      }

      // Cleanup temporary files
      await this.cleanup([tempInputPath, tempMiniaturePath, hlsOutputDir]);

      console.log(`Job completed successfully: ${job.jobId}\n`);

      return {
        jobId: job.jobId,
        success: true,
        videoId: job.videoId,
        media_id: job.media_id,
        miniature_id: job.miniature_id,
        subtitle_id: job.subtitle_id,
        duration,
        processedAt: Date.now(),
      };
    } catch (error: unknown) {
      console.error(`Job failed: ${job.jobId}`, error);

      // Cleanup on error
      await this.cleanup([tempInputPath, tempMiniaturePath, hlsOutputDir]);

      return {
        jobId: job.jobId,
        success: false,
        videoId: job.videoId,
        media_id: job.media_id,
        duration: 0,
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
}
