import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { ScalewayQueuesClient } from 'src/queue/scaleway-queues.client';
import {
  LocalQueueBridgeOptions,
  forwardOneLocalJob,
  validateLocalBridgeTargets,
} from 'src/queue/local-queue-bridge';
import { IVideoEditRenderDispatcher } from '../../domain/gateways/render-dispatcher.gateway';
import { VideoEditRenderMessage } from '../../domain/videoEditRenderJob';

/**
 * Publishes render jobs to their own queue, consumed by the render
 * deployment of the FFmpeg image (FFMPEG_WORKER_MODE=render), so a long
 * render never delays the transcoding of uploads. Same scheme as the
 * recording merge dispatcher: transcoding provider, endpoint, region and
 * signing secret; its own queue URL (VIDEO_EDIT_RENDER_QUEUE_URL) and
 * optional credentials. Without that URL, rendering is disabled (503).
 */
@Injectable()
export class VideoEditRenderDispatcher implements IVideoEditRenderDispatcher {
  readonly enabled: boolean = false;
  private readonly logger = new Logger(VideoEditRenderDispatcher.name);
  private readonly client: ScalewayQueuesClient;
  private readonly queueUrl: string;
  private readonly dispatchSecret: string;
  private readonly localBridge?: LocalQueueBridgeOptions;
  private localBridgeTail: Promise<void> = Promise.resolve();

  constructor() {
    const queueUrl = process.env.VIDEO_EDIT_RENDER_QUEUE_URL;
    const provider = process.env.TRANSCODING_QUEUE_PROVIDER;
    if (!queueUrl) {
      this.logger.warn(
        'Video edit rendering disabled: VIDEO_EDIT_RENDER_QUEUE_URL is not set',
      );
      return;
    }
    if (provider !== 'scaleway' && provider !== 'local') {
      this.logger.warn(
        'Video edit rendering disabled: TRANSCODING_QUEUE_PROVIDER is not scaleway or local',
      );
      return;
    }
    const required = (name: string): string => {
      const value = process.env[name];
      if (!value) throw new Error(`Missing ${name}`);
      return value;
    };
    this.queueUrl = queueUrl;
    this.dispatchSecret = required('TRANSCODING_DISPATCH_SECRET');
    if (this.dispatchSecret.length < 32)
      throw new Error(
        'Transcoding secrets must contain at least 32 characters',
      );
    this.client = new ScalewayQueuesClient({
      endpoint: required('TRANSCODING_QUEUE_ENDPOINT'),
      region: required('TRANSCODING_QUEUE_REGION'),
      accessKey:
        process.env.VIDEO_EDIT_RENDER_QUEUE_ACCESS_KEY ||
        required('TRANSCODING_QUEUE_ACCESS_KEY'),
      secretKey:
        process.env.VIDEO_EDIT_RENDER_QUEUE_SECRET_KEY ||
        required('TRANSCODING_QUEUE_SECRET_KEY'),
      allowLocalHttp: provider === 'local',
    });
    if (provider === 'local') {
      if (process.env.NODE_ENV !== 'development')
        throw new Error(
          'The local queue provider requires NODE_ENV=development',
        );
      // Local render worker: a third FFmpeg container, in render mode.
      const workerUrl =
        process.env.LOCAL_RENDER_BRIDGE_WORKER_URL || 'http://127.0.0.1:8084/';
      validateLocalBridgeTargets(queueUrl, workerUrl);
      this.localBridge = { client: this.client, queueUrl, workerUrl };
    }
    this.enabled = true;
  }

  async publish(message: VideoEditRenderMessage): Promise<void> {
    if (!this.enabled) throw new Error('Video edit rendering is disabled');
    const signature = createHmac('sha256', this.dispatchSecret)
      .update(JSON.stringify(message))
      .digest('hex');
    await this.client.sendMessage(
      this.queueUrl,
      JSON.stringify({ job: message, signature }),
    );
    this.logger.log(`Published render job ${message.jobId}`);
    const localBridge = this.localBridge;
    if (localBridge) {
      // One receive/HTTP/delete cycle per render, serialized like the
      // transcoding bridge: the local render container handles one job.
      this.localBridgeTail = this.localBridgeTail
        .then(async () => {
          const result = await forwardOneLocalJob(localBridge);
          if (result.status === 'empty')
            this.logger.warn(
              `Local render queue was empty after ${message.jobId}`,
            );
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Local render bridge failed after ${message.jobId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }
  }
}
