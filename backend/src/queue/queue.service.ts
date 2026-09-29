import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';
import { VideoTranscodingJob, VideoTranscodingResult } from './job.types';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private connecting?: Promise<void>;
  private resultHandler?: (result: VideoTranscodingResult) => Promise<void>;
  private resultConsumerActive = false;
  private reconnectTimer?: NodeJS.Timeout;
  private shuttingDown = false;
  private readonly queueName =
    process.env.VIDEO_QUEUE_NAME || 'video-transcoding-queue';
  private readonly resultQueueName =
    process.env.VIDEO_RESULT_QUEUE_NAME || 'video-transcoding-results';
  /**
   * Do not silently fall back to localhost in hosted environments. In the
   * upload-only rollout RabbitMQ is intentionally absent and jobs stay in the
   * PostgreSQL outbox until a worker plane is configured.
   */
  get configured(): boolean {
    return Boolean(process.env.RABBITMQ_URL || process.env.RABBITMQ_HOST);
  }
  private get rabbitUrl(): string {
    if (process.env.RABBITMQ_URL) return process.env.RABBITMQ_URL;
    const host = process.env.RABBITMQ_HOST || 'localhost';
    const port = process.env.RABBITMQ_PORT || '5672';
    const username = encodeURIComponent(process.env.RABBITMQ_USERNAME || 'admin');
    const password = encodeURIComponent(process.env.RABBITMQ_PASSWORD || 'admin');
    return `amqp://${username}:${password}@${host}:${port}`;
  }

  private async connect(): Promise<void> {
    if (this.channel) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const connection = await amqp.connect(this.rabbitUrl, { timeout: 10000 });
      const channel = await connection.createConfirmChannel();
      await Promise.all([
        channel.assertQueue(this.queueName, {
          durable: true,
          arguments: { 'x-max-priority': 10 },
        }),
        channel.assertQueue(this.resultQueueName, { durable: true }),
      ]);
      const disconnected = () => {
        if (this.connection !== connection) return;
        this.resetConnection();
        this.scheduleResultConsumer();
        void connection.close().catch(() => undefined);
      };
      channel.on('error', disconnected);
      channel.on('close', disconnected);
      connection.on('close', () => {
        if (this.connection !== connection) return;
        this.resetConnection();
        this.scheduleResultConsumer();
      });
      connection.on('error', (error) =>
        this.logger.error('RabbitMQ connection error', error),
      );
      this.connection = connection;
      this.channel = channel;
      this.logger.log(`Connected to RabbitMQ queue ${this.queueName}`);
    })().finally(() => {
      this.connecting = undefined;
    });

    return this.connecting;
  }

  async publishJob(job: VideoTranscodingJob, priority = 5): Promise<void> {
    if (!this.configured) throw new Error('RabbitMQ is not configured');
    await this.connect();
    const channel = this.channel;
    await new Promise<void>((resolve, reject) => channel.sendToQueue(this.queueName, Buffer.from(JSON.stringify(job)), {
      persistent: true, priority, contentType: 'application/json',
    }, error => error ? reject(error) : resolve()));
    this.logger.log(`Published transcoding job ${job.jobId}`);
  }

  async consumeResults(
    handler: (result: VideoTranscodingResult) => Promise<void>,
  ): Promise<void> {
    this.resultHandler = handler;
    if (!this.configured) return;
    await this.startResultConsumer();
  }

  private async startResultConsumer(): Promise<void> {
    if (this.resultConsumerActive || !this.resultHandler || this.shuttingDown) {
      return;
    }
    try {
      await this.connect();
      const channel = this.channel;
      await channel.prefetch(10);
      await channel.consume(this.resultQueueName, async (message) => {
        if (!message) { this.resetConnection(); this.scheduleResultConsumer(); return; }
        let result: VideoTranscodingResult;
        try {
          if (message.content.length > 64 * 1024) throw new Error('Oversized result');
          result = JSON.parse(message.content.toString());
          if (!/^[0-9a-f-]{36}$/i.test(result.videoId) || !/^[0-9a-f-]{36}$/i.test(result.jobId) ||
            typeof result.success !== 'boolean' || !Number.isFinite(result.duration) || result.duration < 0 ||
            (result.error !== undefined && typeof result.error !== 'string') ||
            (result.success && !new RegExp(`^${result.videoId}/jobs/${result.jobId}/[0-9a-f-]{36}/master\\.m3u8$`).test(result.media_id || ''))) throw new Error('Invalid result');
        } catch { if (this.channel === channel) channel.nack(message, false, false); return; }
        try {
          await this.resultHandler?.(result);
          if (this.channel === channel) channel.ack(message);
        } catch (error) {
          this.logger.error('Unable to process transcoding result', error);
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (this.channel === channel) channel.nack(message, false, true);
        }
      });
      this.resultConsumerActive = true;
    } catch (error) {
      this.logger.warn(
        `RabbitMQ result consumer unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.resetConnection();
      this.scheduleResultConsumer();
    }
  }

  private scheduleResultConsumer(): void {
    if (this.shuttingDown || !this.resultHandler || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.startResultConsumer();
    }, 5000);
  }

  private resetConnection(): void {
    this.channel = undefined;
    this.connection = undefined;
    this.resultConsumerActive = false;
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
    this.resetConnection();
  }
}
