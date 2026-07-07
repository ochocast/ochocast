import 'dotenv/config';
import { createS3Client } from './config/s3.config';
import { QueueService } from './services/queue.service';
import { TranscodingService } from './services/transcoding.service';
import { VideoTranscodingJob } from './types/job.types';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { ConsumeMessage } from 'amqplib';

class FFmpegWorker {
  private queueService: QueueService;
  private transcodingService: TranscodingService;
  private s3Client;
  private workerId: string;
  private concurrency: number;
  private isShuttingDown = false;
  private activeJobs = 0;

  constructor() {
    this.workerId = process.env.WORKER_ID || `worker-${Date.now()}`;
    this.concurrency = parseInt(process.env.WORKER_CONCURRENCY || '1', 10);
    this.s3Client = createS3Client();
    this.queueService = new QueueService();
    this.transcodingService = new TranscodingService(this.s3Client);
  }

  async start(): Promise<void> {
    try {
      console.log(`
╔═══════════════════════════════════════════════════╗
║  FFmpeg Transcoding Worker                        ║
╚═══════════════════════════════════════════════════╝

Worker ID: ${this.workerId}
Concurrency: ${this.concurrency}
Minio: ${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}
RabbitMQ: ${process.env.RABBITMQ_URL}
Queue: ${process.env.VIDEO_QUEUE_NAME}

Starting worker...
      `);

      await this.queueService.connect();

      // Start consuming jobs
      await this.queueService.consumeJobs(
        this.handleJob.bind(this),
        this.concurrency,
      );

      console.log('Worker started and ready to process jobs\n');
    } catch (error) {
      console.error('Failed to start worker:', error);
      process.exit(1);
    }
  }

  private async handleJob(
    job: VideoTranscodingJob,
    msg: ConsumeMessage,
  ): Promise<void> {
    if (this.isShuttingDown) {
      console.log('Worker is shutting down, rejecting job');
      this.queueService.nackJob(msg, true);
      return;
    }

    this.activeJobs++;
    const startTime = Date.now();

    try {
      console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`Received job: ${job.jobId}`);
      console.log(`   Video ID: ${job.videoId}`);
      console.log(`   Title: ${job.title}`);
      console.log(`   Original file: ${job.originalFileName}`);
      console.log(`   Active jobs: ${this.activeJobs}`);

      // Download video from S3
      const videoBuffer = await this.downloadFromS3(
        process.env.STOCK_MEDIA_BUCKET || 'media',
        job.originalKey,
      );

      // Download miniature if exists
      let miniatureBuffer: Buffer | undefined;
      if (job.miniatureSourceKey) {
        try {
          miniatureBuffer = await this.downloadFromS3(
            process.env.STOCK_MINIATURE_BUCKET || 'miniature',
            job.miniatureSourceKey,
          );
        } catch (_error) {
          console.log('   No miniature found, will generate from video');
        }
      } else {
        console.log('   No miniature provided, will generate from video');
      }

      // Download subtitle if exists
      let subtitleBuffer: Buffer | undefined;
      if (job.subtitleSourceKey) {
        try {
          subtitleBuffer = await this.downloadFromS3(
            process.env.STOCK_MEDIA_BUCKET || 'media',
            job.subtitleSourceKey,
          );
        } catch (error) {
          console.log('   Subtitle not found, skipping');
        }
      }

      // Process the job
      const result = await this.transcodingService.processJob(
        job,
        videoBuffer,
        miniatureBuffer,
        subtitleBuffer,
      );

      await this.queueService.publishResult(result);
      this.queueService.ackJob(msg);

      if (result.success) {
        const duration = (Date.now() - startTime) / 1000;
        console.log(`Job completed in ${duration.toFixed(2)}s`);
      } else {
        console.error(`Job failed: ${result.error}`);
      }
    } catch (error: unknown) {
      console.error('Error processing job:', error);
      try {
        await this.queueService.publishResult({
          jobId: job.jobId,
          videoId: job.videoId,
          success: false,
          duration: 0,
          error: error instanceof Error ? error.message : String(error),
          processedAt: Date.now(),
        });
        this.queueService.ackJob(msg);
      } catch (publishError) {
        console.error('Unable to publish failure result:', publishError);
        this.queueService.nackJob(msg, true);
      }
    } finally {
      this.activeJobs--;
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    }
  }

  private async downloadFromS3(bucket: string, key: string): Promise<Buffer> {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await this.s3Client.send(command);
    return this.streamToBuffer(response.Body);
  }

  private async streamToBuffer(stream: unknown): Promise<Buffer> {
    if (!stream || typeof (stream as NodeJS.ReadableStream).on !== 'function') {
      throw new Error('S3 response did not contain a readable body');
    }
    const readable = stream as NodeJS.ReadableStream;
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      readable.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      readable.on('error', reject);
      readable.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async stop(): Promise<void> {
    console.log('\nInitiating graceful shutdown...');
    this.isShuttingDown = true;

    // Wait for active jobs to complete
    const maxWait = 60000; // 60 seconds
    const checkInterval = 1000; // 1 second
    let waited = 0;

    while (this.activeJobs > 0 && waited < maxWait) {
      console.log(
        `   Waiting for ${this.activeJobs} active job(s) to complete...`,
      );
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (this.activeJobs > 0) {
      console.log(`Forcing shutdown with ${this.activeJobs} active job(s)`);
    }

    await this.queueService.close();
    console.log('Worker stopped');
  }
}

// Start the worker
const worker = new FFmpegWorker();
worker.start().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
  await worker.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await worker.stop();
  process.exit(0);
});
