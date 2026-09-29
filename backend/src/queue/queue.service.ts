import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { TranscodingJobsService } from '../transcoding-jobs/transcoding-jobs.service';
import { VideoTranscodingJob } from './job.types';
import {
  forwardOneLocalJob,
  validateLocalBridgeTargets,
} from './local-queue-bridge';
import type { LocalQueueBridgeOptions } from './local-queue-bridge';
import { ScalewayQueuesClient } from './scaleway-queues.client';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);
  private readonly client: ScalewayQueuesClient;
  private readonly queueUrl: string;
  private readonly dispatchSecret: string;
  private readonly provider: 'scaleway' | 'local';
  private readonly localBridge?: LocalQueueBridgeOptions;
  private localBridgeTail: Promise<void> = Promise.resolve();

  constructor(private readonly jobs: TranscodingJobsService) {
    const provider = process.env.TRANSCODING_QUEUE_PROVIDER;
    if (provider !== 'scaleway' && provider !== 'local') {
      throw new Error('TRANSCODING_QUEUE_PROVIDER must be scaleway or local');
    }
    if (provider === 'local' && process.env.NODE_ENV !== 'development') {
      throw new Error('The local queue provider requires NODE_ENV=development');
    }
    this.provider = provider;
    const required = (name: string): string => {
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
    this.client = new ScalewayQueuesClient({
      endpoint: required('TRANSCODING_QUEUE_ENDPOINT'),
      region: required('TRANSCODING_QUEUE_REGION'),
      accessKey: required('TRANSCODING_QUEUE_ACCESS_KEY'),
      secretKey: required('TRANSCODING_QUEUE_SECRET_KEY'),
      allowLocalHttp: provider === 'local',
    });
    const localQueueUrl =
      provider === 'local'
        ? this.queueUrl
        : process.env.LOCAL_QUEUE_BRIDGE_QUEUE_URL;
    if (process.env.NODE_ENV === 'development' && localQueueUrl) {
      if (localQueueUrl !== this.queueUrl) {
        throw new Error(
          'LOCAL_QUEUE_BRIDGE_QUEUE_URL must match TRANSCODING_QUEUE_URL',
        );
      }
      const workerUrl =
        process.env.LOCAL_QUEUE_BRIDGE_WORKER_URL || 'http://127.0.0.1:8081/';
      validateLocalBridgeTargets(localQueueUrl, workerUrl);
      this.localBridge = {
        client: new ScalewayQueuesClient({
          endpoint: required('TRANSCODING_QUEUE_ENDPOINT'),
          region: required('TRANSCODING_QUEUE_REGION'),
          accessKey: required(
            provider === 'local'
              ? 'TRANSCODING_QUEUE_ACCESS_KEY'
              : 'LOCAL_QUEUE_BRIDGE_ACCESS_KEY',
          ),
          secretKey: required(
            provider === 'local'
              ? 'TRANSCODING_QUEUE_SECRET_KEY'
              : 'LOCAL_QUEUE_BRIDGE_SECRET_KEY',
          ),
          allowLocalHttp: provider === 'local',
        }),
        queueUrl: localQueueUrl,
        workerUrl,
      };
    }
  }

  async publishJob(job: VideoTranscodingJob): Promise<void> {
    await this.jobs.register(job);
    const signature = createHmac('sha256', this.dispatchSecret)
      .update(JSON.stringify(job))
      .digest('hex');
    await this.client.sendMessage(
      this.queueUrl,
      JSON.stringify({ job, signature }),
    );
    this.logger.log(`Published ${this.provider} transcoding job ${job.jobId}`);
    const localBridge = this.localBridge;
    if (localBridge) {
      // Uploads return promptly. Each upload schedules one receive/HTTP/delete
      // cycle, serialized because the local FFmpeg container handles one job.
      this.localBridgeTail = this.localBridgeTail
        .then(async () => {
          const result = await forwardOneLocalJob(localBridge);
          if (result.status === 'empty') {
            this.logger.warn(
              `Local queue was empty after publishing ${job.jobId}`,
            );
          } else {
            this.logger.log(
              `Local FFmpeg processed queue message ${result.messageId}`,
            );
          }
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Local FFmpeg bridge failed after publishing ${job.jobId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }
  }
}
