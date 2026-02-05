import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as amqp from 'amqplib/callback_api';
import { VideoTranscodingJob } from './job.types';

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private connection: any = null;
  private channel: any = null;
  private readonly queueName: string;
  private readonly rabbitUrl: string;

  constructor() {
    this.queueName = process.env.VIDEO_QUEUE_NAME || 'video-transcoding-queue';
    this.rabbitUrl =
      process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.close();
  }

  private async connect(): Promise<void> {
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

          channel.assertQueue(
            this.queueName,
            {
              durable: true,
              arguments: {
                'x-max-priority': 10,
              },
            },
            (error2) => {
              if (error2) {
                reject(error2);
                return;
              }

              console.log(
                `Backend connected to RabbitMQ queue: ${this.queueName}`,
              );
              resolve();
            },
          );
        });
      });
    });
  }

  async publishJob(
    job: VideoTranscodingJob,
    priority: number = 5,
  ): Promise<void> {
    if (!this.channel) {
      await this.connect();
    }

    const message = JSON.stringify(job);
    this.channel.sendToQueue(this.queueName, Buffer.from(message), {
      persistent: true,
      priority: priority,
    });

    console.log(`Video transcoding job published: ${job.jobId}`);
  }

  async getQueueStats(): Promise<{
    messageCount: number;
    consumerCount: number;
  }> {
    if (!this.channel) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      this.channel.assertQueue(
        this.queueName,
        { durable: true },
        (error: any, ok: any) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              messageCount: ok.messageCount,
              consumerCount: ok.consumerCount,
            });
          }
        },
      );
    });
  }

  private async close(): Promise<void> {
    try {
      if (this.channel) {
        await new Promise((resolve) => this.channel.close(resolve));
      }
      if (this.connection) {
        await new Promise((resolve) => this.connection.close(resolve));
      }
      console.log('RabbitMQ connection closed');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }
}
