import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib';
import { VideoTranscodingJob, VideoTranscodingResult } from './job.types';
import { createHmac } from 'node:crypto';
import { TranscodingJobsService } from '../transcoding-jobs/transcoding-jobs.service';
import { ScalewayQueuesClient } from './scaleway-queues.client';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly provider =
    process.env.TRANSCODING_QUEUE_PROVIDER || 'rabbitmq';
  private scalewayQueues?: ScalewayQueuesClient;
  private queueUrl?: string;
  private dispatchSecret?: string;

  constructor(private readonly jobs: TranscodingJobsService) {
    if (!['rabbitmq', 'scaleway'].includes(this.provider))
      throw new Error('Unknown TRANSCODING_QUEUE_PROVIDER');
    if (this.provider === 'scaleway') {
      const required = (name: string) => {
        const value = process.env[name];
        if (!value) throw new Error(`Missing ${name}`);
        return value;
      };
      this.queueUrl = required('TRANSCODING_QUEUE_URL');
      this.dispatchSecret = required('TRANSCODING_DISPATCH_SECRET');
      if (
        this.dispatchSecret.length < 32 ||
        required('TRANSCODING_CALLBACK_SECRET').length < 32
      ) {
        throw new Error(
          'Transcoding secrets must contain at least 32 characters',
        );
      }
      this.scalewayQueues = new ScalewayQueuesClient({
        endpoint: required('TRANSCODING_QUEUE_ENDPOINT'),
        region: required('TRANSCODING_QUEUE_REGION'),
        accessKey: required('TRANSCODING_QUEUE_ACCESS_KEY'),
        secretKey: required('TRANSCODING_QUEUE_SECRET_KEY'),
      });
    }
  }
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
  private readonly rabbitUrl =
    process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';

  private async connect(): Promise<void> {
    if (this.channel) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const connection = await amqp.connect(this.rabbitUrl);
      const channel = await connection.createConfirmChannel();
      await Promise.all([
        channel.assertQueue(this.queueName, {
          durable: true,
          arguments: { 'x-max-priority': 10 },
        }),
        channel.assertQueue(this.resultQueueName, { durable: true }),
      ]);
      connection.on('close', () => {
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
    if (this.scalewayQueues) {
      await this.jobs.register(job);
      const signature = createHmac('sha256', this.dispatchSecret)
        .update(JSON.stringify(job))
        .digest('hex');
      await this.scalewayQueues.sendMessage(
        this.queueUrl,
        JSON.stringify({ job, signature }),
      );
      this.logger.log(`Published serverless transcoding job ${job.jobId}`);
      return;
    }
    await this.connect();
    this.channel.sendToQueue(this.queueName, Buffer.from(JSON.stringify(job)), {
      persistent: true,
      priority,
      contentType: 'application/json',
    });
    await this.channel.waitForConfirms();
    this.logger.log(`Published transcoding job ${job.jobId}`);
  }

  async consumeResults(
    handler: (result: VideoTranscodingResult) => Promise<void>,
  ): Promise<void> {
    if (this.provider === 'scaleway') return;
    this.resultHandler = handler;
    await this.startResultConsumer();
  }

  private async startResultConsumer(): Promise<void> {
    if (this.resultConsumerActive || !this.resultHandler || this.shuttingDown) {
      return;
    }
    try {
      await this.connect();
      await this.channel.consume(this.resultQueueName, async (message) => {
        if (!message) return;
        try {
          const result = JSON.parse(
            message.content.toString(),
          ) as VideoTranscodingResult;
          await this.resultHandler?.(result);
          this.channel?.ack(message);
        } catch (error) {
          this.logger.error('Unable to process transcoding result', error);
          this.channel?.nack(message, false, true);
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
