import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { TranscodingJobsService } from '../transcoding-jobs/transcoding-jobs.service';
import { VideoTranscodingJob } from './job.types';
import {
  forwardOneLocalJob,
  validateLocalBridgeTargets,
} from './local-queue-bridge';
import type { LocalQueueBridgeOptions } from './local-queue-bridge';
import { ScalewayQueuesClient } from './scaleway-queues.client';

// Without a provider these settings mean a deployment lost its provider key:
// fail at boot instead of silently switching transcoding off.
const QUEUE_SETTINGS = [
  'TRANSCODING_QUEUE_URL',
  'TRANSCODING_QUEUE_ENDPOINT',
  'TRANSCODING_QUEUE_REGION',
  'TRANSCODING_QUEUE_ACCESS_KEY',
  'TRANSCODING_QUEUE_SECRET_KEY',
  'TRANSCODING_DISPATCH_SECRET',
];

function resolveProvider(): 'scaleway' | 'local' | 'disabled' {
  const provider = process.env.TRANSCODING_QUEUE_PROVIDER;
  const invalid =
    'TRANSCODING_QUEUE_PROVIDER must be scaleway, local or disabled';
  if (
    provider === 'scaleway' ||
    provider === 'local' ||
    provider === 'disabled'
  )
    return provider;
  if (provider) throw new Error(invalid);
  if (QUEUE_SETTINGS.some((name) => process.env[name]))
    throw new Error(`${invalid} (queue settings present without a provider)`);
  return 'disabled';
}

export class TranscodingDisabledError extends Error {
  constructor() {
    super('Transcoding is disabled by TRANSCODING_QUEUE_PROVIDER');
    this.name = 'TranscodingDisabledError';
  }
}

@Injectable()
export class QueueService implements OnApplicationBootstrap {
  /** False when no queue is configured: uploads are then served from source. */
  readonly enabled: boolean;
  private readonly logger = new Logger(QueueService.name);
  private readonly client: ScalewayQueuesClient;
  private readonly queueUrl: string;
  private readonly dispatchSecret: string;
  private readonly provider: 'scaleway' | 'local';
  private readonly localBridge?: LocalQueueBridgeOptions;
  private localBridgeTail: Promise<void> = Promise.resolve();

  constructor(private readonly jobs: TranscodingJobsService) {
    const provider = resolveProvider();
    this.enabled = provider !== 'disabled';
    if (provider === 'disabled') {
      const ignored = QUEUE_SETTINGS.filter((name) => process.env[name]);
      this.logger.warn(
        'Transcoding queue disabled: uploads are served from their source file' +
          (ignored.length ? `; ignoring ${ignored.join(', ')}` : ''),
      );
      return;
    }
    if (provider === 'local' && process.env.NODE_ENV !== 'development') {
      throw new Error('The local queue provider requires NODE_ENV=development');
    }
    // Without it, HLS playlist URLs are built from the request protocol, which
    // is http behind the TLS-terminating ingress: browsers block them. In
    // local development (the local queue bridge) page and API are both http.
    if (
      provider === 'scaleway' &&
      process.env.NODE_ENV !== 'development' &&
      !process.env.PUBLIC_API_URL?.startsWith('https://')
    ) {
      throw new Error(
        'PUBLIC_API_URL must be an https URL when the Scaleway transcoding queue is enabled',
      );
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

  async onApplicationBootstrap(): Promise<void> {
    if (this.enabled) return;
    // Jobs registered while enabled are no longer dispatched: make them visible.
    try {
      const { count, oldest } = await this.jobs.unfinished();
      if (!count) return;
      const age = oldest
        ? `oldest last published ${oldest.toISOString()}, ${Math.round((Date.now() - oldest.getTime()) / 60_000)} min ago`
        : 'registration time unknown';
      this.logger.warn(
        `${count} transcoding job(s) still pending or processing (${age}): ` +
          'their videos stay pending until the queue is re-enabled to drain them; ' +
          'keep TRANSCODING_CALLBACK_SECRET set so in-flight jobs can still complete',
      );
    } catch (e) {
      this.logger.warn(
        `Unfinished transcoding jobs could not be counted: ${e.message}`,
      );
    }
  }

  // Then publishRegisteredJob: once registered, a job whose publication failed
  // is republished by reconciliation (UploadsService.maintain).
  async registerJob(job: VideoTranscodingJob): Promise<void> {
    // Checked before register: a disabled queue must not leave an orphan job.
    if (!this.enabled) throw new TranscodingDisabledError();
    await this.jobs.register(job);
  }

  async publishRegisteredJob(job: VideoTranscodingJob): Promise<void> {
    if (!this.enabled) throw new TranscodingDisabledError();
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
