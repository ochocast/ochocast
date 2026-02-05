import * as amqp from 'amqplib/callback_api';
import { VideoTranscodingJob } from '../types/job.types';

export class QueueService {
  private connection: amqp.Connection | null = null;
  private channel: amqp.Channel | null = null;
  private queueName: string;
  private rabbitUrl: string;

  constructor() {
    this.queueName = process.env.VIDEO_QUEUE_NAME || 'video-transcoding-queue';
    this.rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      amqp.connect(this.rabbitUrl, (error0, connection) => {
        if (error0) {
          reject(error0);
          return;
        }
        
        this.connection = connection;
        
        connection.createChannel((error1, channel) => {
          if (error1) {
            reject(error1);
            return;
          }
          
          this.channel = channel;
          
          channel.assertQueue(this.queueName, {
            durable: true,
            arguments: {
              'x-max-priority': 10,
            },
          }, (error2) => {
            if (error2) {
              reject(error2);
              return;
            }
            
            console.log(`Connected to RabbitMQ`);
            console.log(`   Queue: ${this.queueName}`);
            console.log(`   URL: ${this.rabbitUrl}`);
            resolve();
          });
        });
      });
    });
  }

  async publishJob(job: VideoTranscodingJob, priority: number = 5): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }
    
    if (!this.channel) {
      throw new Error('Failed to connect to RabbitMQ');
    }
    
    const message = JSON.stringify(job);
    this.channel.sendToQueue(
      this.queueName,
      Buffer.from(message),
      {
        persistent: true,
        priority: priority,
      }
    );
    
    console.log(`Job published to queue: ${job.jobId} (priority: ${priority}`);
  }

  async consumeJobs(
    handler: (job: VideoTranscodingJob, msg: amqp.Message) => Promise<void>,
    concurrency: number = 1
  ): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    if (!this.channel) {
      throw new Error('Failed to connect to RabbitMQ');
    }

    this.channel.prefetch(concurrency);

    console.log(`Worker listening to queue: ${this.queueName}`);
    console.log(`   Concurrency: ${concurrency}`);

    const channel = this.channel;
    this.channel.consume(
      this.queueName,
      async (msg: amqp.Message | null) => {
        if (msg) {
          try {
            const job: VideoTranscodingJob = JSON.parse(msg.content.toString());
            await handler(job, msg);
          } catch (error) {
            console.error('Error processing message:', error);
            channel.nack(msg, false, false);
          }
        }
      },
      { noAck: false }
    );
  }

  ackJob(msg: amqp.Message): void {
    if (this.channel) {
      this.channel.ack(msg);
    }
  }

  nackJob(msg: amqp.Message, requeue: boolean = false): void {
    if (this.channel) {
      this.channel.nack(msg, false, requeue);
    }
  }

  async getQueueStats(): Promise<{ messageCount: number; consumerCount: number }> {
    if (!this.channel) {
      await this.connect();
    }

    if (!this.channel) {
      throw new Error('Failed to connect to RabbitMQ');
    }

    return new Promise((resolve, reject) => {
      this.channel!.assertQueue(this.queueName, { durable: true }, (error: Error | null, ok: amqp.Replies.AssertQueue) => {
        if (error) {
          reject(error);
        } else {
          resolve({
            messageCount: ok.messageCount,
            consumerCount: ok.consumerCount,
          });
        }
      });
    });
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await new Promise((resolve) => this.channel!.close(resolve));
      }
      if (this.connection) {
        await new Promise((resolve) => this.connection!.close(resolve));
      }
      console.log('RabbitMQ connection closed');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }

  getChannel(): amqp.Channel | null {
    return this.channel;
  }

  getQueueName(): string {
    return this.queueName;
  }
}
