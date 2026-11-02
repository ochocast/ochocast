import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ScalewayQueuesClient } from 'src/queue/scaleway-queues.client';
import {
  LocalQueueBridgeOptions,
  forwardOneLocalJob,
  validateLocalBridgeTargets,
} from 'src/queue/local-queue-bridge';
import { IMergeJobDispatcher } from '../../domain/gateways/merge-job-dispatcher.gateway';
import { RecordingMergeJob } from '../../domain/recordingMergeJob';
import { RecordingMergeJobEntity } from './recording-merge-job.entity';
import { RecordingMergeJobsService } from './recording-merge-jobs.service';

/**
 * US-3 — Publishes merge jobs to their own queue, consumed by the merge
 * deployment of the FFmpeg image (FFMPEG_WORKER_MODE=merge), so a long merge
 * never delays the transcoding of uploads.
 *
 * Reuses the transcoding queue provider, endpoint, region and signing secret;
 * only the queue URL is specific (RECORDING_MERGE_QUEUE_URL), with optional
 * dedicated credentials. Without that URL, merging is disabled.
 */
@Injectable()
export class RecordingMergeDispatcher implements IMergeJobDispatcher {
  readonly enabled: boolean = false;
  private readonly logger = new Logger(RecordingMergeDispatcher.name);
  private readonly client: ScalewayQueuesClient;
  private readonly queueUrl: string;
  private readonly dispatchSecret: string;
  private readonly localBridge?: LocalQueueBridgeOptions;
  private localBridgeTail: Promise<void> = Promise.resolve();

  constructor(
    private readonly jobs: RecordingMergeJobsService,
    private readonly dataSource: DataSource,
  ) {
    const queueUrl = process.env.RECORDING_MERGE_QUEUE_URL;
    const provider = process.env.TRANSCODING_QUEUE_PROVIDER;
    if (!queueUrl) {
      this.logger.warn(
        'Recording merge disabled: RECORDING_MERGE_QUEUE_URL is not set',
      );
      return;
    }
    if (provider !== 'scaleway' && provider !== 'local') {
      this.logger.warn(
        'Recording merge disabled: TRANSCODING_QUEUE_PROVIDER is not scaleway or local',
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
    const accessKey =
      process.env.RECORDING_MERGE_QUEUE_ACCESS_KEY ||
      required('TRANSCODING_QUEUE_ACCESS_KEY');
    const secretKey =
      process.env.RECORDING_MERGE_QUEUE_SECRET_KEY ||
      required('TRANSCODING_QUEUE_SECRET_KEY');
    this.client = new ScalewayQueuesClient({
      endpoint: required('TRANSCODING_QUEUE_ENDPOINT'),
      region: required('TRANSCODING_QUEUE_REGION'),
      accessKey,
      secretKey,
      allowLocalHttp: provider === 'local',
    });
    if (provider === 'local') {
      if (process.env.NODE_ENV !== 'development')
        throw new Error(
          'The local queue provider requires NODE_ENV=development',
        );
      // Local merge worker: the second FFmpeg container, in merge mode.
      const workerUrl =
        process.env.LOCAL_MERGE_BRIDGE_WORKER_URL || 'http://127.0.0.1:8082/';
      validateLocalBridgeTargets(queueUrl, workerUrl);
      this.localBridge = { client: this.client, queueUrl, workerUrl };
    }
    this.enabled = true;
  }

  async dispatch(job: RecordingMergeJob): Promise<void> {
    if (!this.enabled) throw new Error('Recording merge is disabled');
    await this.jobs.register(job);
    const signature = createHmac('sha256', this.dispatchSecret)
      .update(JSON.stringify(job))
      .digest('hex');
    try {
      await this.client.sendMessage(
        this.queueUrl,
        JSON.stringify({ job, signature }),
      );
    } catch (error) {
      // Nothing was queued: drop the job so it does not linger as pending.
      await this.dataSource
        .getRepository(RecordingMergeJobEntity)
        .delete({ id: job.jobId })
        .catch(() => undefined);
      throw error;
    }
    this.logger.log(`Published merge job ${job.jobId}`);
    const localBridge = this.localBridge;
    if (localBridge) {
      // One receive/HTTP/delete cycle per merge, serialized like the
      // transcoding bridge: the local merge container handles one job.
      this.localBridgeTail = this.localBridgeTail
        .then(async () => {
          const result = await forwardOneLocalJob(localBridge);
          if (result.status === 'empty')
            this.logger.warn(`Local merge queue was empty after ${job.jobId}`);
        })
        .catch((error: unknown) => {
          this.logger.error(
            `Local merge bridge failed after ${job.jobId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
    }
  }
}
