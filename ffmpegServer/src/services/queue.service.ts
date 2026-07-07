import * as amqp from 'amqplib';
import {
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../types/job.types';

export class QueueService {
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private readonly queueName =
    process.env.VIDEO_QUEUE_NAME || 'video-transcoding-queue';
  private readonly resultQueueName =
    process.env.VIDEO_RESULT_QUEUE_NAME || 'video-transcoding-results';
  private readonly rabbitUrl =
    process.env.RABBITMQ_URL || 'amqp://admin:admin@localhost:5672';

  async connect(): Promise<void> {
    this.connection = await amqp.connect(this.rabbitUrl);
    this.channel = await this.connection.createConfirmChannel();
    await Promise.all([
      this.channel.assertQueue(this.queueName, {
        durable: true,
        arguments: { 'x-max-priority': 10 },
      }),
      this.channel.assertQueue(this.resultQueueName, { durable: true }),
    ]);
    console.log(`Connected to RabbitMQ queue ${this.queueName}`);
  }

  async consumeJobs(
    handler: (
      job: VideoTranscodingJob,
      message: amqp.ConsumeMessage,
    ) => Promise<void>,
    concurrency = 1,
  ): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ is not connected');
    await this.channel.prefetch(concurrency);
    await this.channel.consume(this.queueName, async (message) => {
      if (!message) return;
      try {
        const job = JSON.parse(
          message.content.toString(),
        ) as VideoTranscodingJob;
        await handler(job, message);
      } catch (error) {
        console.error('Invalid transcoding message:', error);
        this.channel?.nack(message, false, false);
      }
    });
  }

  async publishResult(result: VideoTranscodingResult): Promise<void> {
    if (!this.channel) throw new Error('RabbitMQ is not connected');
    this.channel.sendToQueue(
      this.resultQueueName,
      Buffer.from(JSON.stringify(result)),
      { persistent: true, contentType: 'application/json' },
    );
    await this.channel.waitForConfirms();
  }

  ackJob(message: amqp.ConsumeMessage): void {
    this.channel?.ack(message);
  }

  nackJob(message: amqp.ConsumeMessage, requeue = false): void {
    this.channel?.nack(message, false, requeue);
  }

  async close(): Promise<void> {
    await this.channel?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
