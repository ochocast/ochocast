import * as amqp from 'amqplib';
import { VideoTranscodingJob, VideoTranscodingResult } from '../types/job.types';

export class QueueService {
  private connection?: amqp.ChannelModel;
  private channel?: amqp.ConfirmChannel;
  private consumerTag?: string;
  private deliveries = new WeakMap<amqp.ConsumeMessage, amqp.ConfirmChannel>();
  onDisconnect: () => void = () => {};
  get ready() { return Boolean(this.channel && this.consumerTag); }
  private readonly queueName = process.env.VIDEO_QUEUE_NAME || 'video-transcoding-queue';
  private readonly resultQueueName = process.env.VIDEO_RESULT_QUEUE_NAME || 'video-transcoding-results';
  private get rabbitUrl(): string {
    if (process.env.RABBITMQ_URL) return process.env.RABBITMQ_URL;
    return `amqp://${encodeURIComponent(process.env.RABBITMQ_USERNAME || 'admin')}:${encodeURIComponent(process.env.RABBITMQ_PASSWORD || 'admin')}@${process.env.RABBITMQ_HOST || 'localhost'}:${process.env.RABBITMQ_PORT || '5672'}?heartbeat=30`;
  }
  async connect() {
    const connection = await amqp.connect(this.rabbitUrl, { timeout: 10000 });
    this.connection = connection;
    const lost = () => {
      if (this.connection !== connection) return;
      this.channel = undefined; this.consumerTag = undefined; this.connection = undefined;
      this.onDisconnect();
      void connection.close().catch(() => undefined);
    };
    connection.on('error', () => lost()); connection.on('close', lost);
    try {
      const channel = await connection.createConfirmChannel();
      channel.on('error', lost); channel.on('close', lost);
      await channel.assertQueue(this.queueName, { durable: true, arguments: { 'x-max-priority': 10 } });
      await channel.assertQueue(this.resultQueueName, { durable: true });
      if (this.connection !== connection) throw new Error('Connection lost during setup');
      this.channel = channel;
    } catch (e) { lost(); throw e; }
  }
  async consumeJobs(handler: (job: VideoTranscodingJob, message: amqp.ConsumeMessage) => Promise<void>, concurrency = 1) {
    const channel = this.channel;
    if (!channel) throw new Error('RabbitMQ is not connected');
    await channel.prefetch(concurrency);
    const consumer = await channel.consume(this.queueName, async message => {
      if (!message) { await this.close(); this.onDisconnect(); return; }
      this.deliveries.set(message, channel);
      let job: VideoTranscodingJob;
      try {
        if (message.content.length > 64 * 1024) throw new Error('Oversized message');
        job = JSON.parse(message.content.toString());
        if (!/^[0-9a-f-]{36}$/i.test(job.jobId) || !/^[0-9a-f-]{36}$/i.test(job.videoId) ||
          typeof job.originalKey !== 'string' || !job.originalKey.startsWith(`${job.videoId}/source/`) || job.originalKey.includes('..')) throw new Error('Invalid job');
      } catch { this.nackJob(message, false); return; }
      try { await handler(job, message); }
      catch { this.nackJob(message, true); }
    });
    if (channel !== this.channel) throw new Error('Connection lost during consume');
    this.consumerTag = consumer.consumerTag;
  }
  async publishResult(result: VideoTranscodingResult, message?: amqp.ConsumeMessage) {
    const channel = message ? this.deliveries.get(message) : this.channel;
    if (!channel || channel !== this.channel) throw new Error('Original RabbitMQ connection lost');
    await new Promise<void>((resolve, reject) => channel.sendToQueue(this.resultQueueName,
      Buffer.from(JSON.stringify(result)), { persistent: true, contentType: 'application/json' },
      error => error ? reject(error) : resolve()));
  }
  ackJob(message: amqp.ConsumeMessage) {
    const channel = this.deliveries.get(message);
    if (channel && channel === this.channel) channel.ack(message);
  }
  nackJob(message: amqp.ConsumeMessage, requeue = false) {
    const channel = this.deliveries.get(message);
    if (channel && channel === this.channel) channel.nack(message, false, requeue);
  }
  async stopConsuming() {
    if (this.channel && this.consumerTag) await this.channel.cancel(this.consumerTag).catch(() => undefined);
    this.consumerTag = undefined;
  }
  async close() {
    const connection = this.connection;
    const channel = this.channel;
    this.connection = undefined; this.channel = undefined; this.consumerTag = undefined;
    await channel?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }
}
