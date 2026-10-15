import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import {
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../queue/job.types';
import { PLAYABLE_AS_IS } from '../queue/transcoding-plan';
import { VideoEntity } from '../videos/infra/gateways/entities/video.entity';
import { TranscodingJobEntity } from './transcoding-job.entity';

// Too long to transcode in the worker's limits: the source is played instead.
export const SOURCE_PLAYBACK_REASONS = new Set([
  'duration_exceeded',
  'deadline_exceeded',
]);

@Injectable()
export class TranscodingJobsService {
  private readonly logger = new Logger(TranscodingJobsService.name);
  private readonly leaseSeconds = Number(
    process.env.TRANSCODING_LEASE_SECONDS || 3600,
  );
  private readonly maxAttempts = Number(
    process.env.TRANSCODING_MAX_ATTEMPTS || 10,
  );

  constructor(private readonly dataSource: DataSource) {
    if (!Number.isInteger(this.leaseSeconds) || this.leaseSeconds < 60) {
      throw new Error('TRANSCODING_LEASE_SECONDS must be an integer >= 60');
    }
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('TRANSCODING_MAX_ATTEMPTS must be a positive integer');
    }
  }

  async register(
    job: VideoTranscodingJob,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    await manager.getRepository(TranscodingJobEntity).insert({
      id: job.jobId,
      videoId: job.videoId,
      payload: job,
      status: 'pending',
      attempts: 0,
    });
  }

  // Jobs a disabled queue can no longer dispatch, reported once at boot.
  async unfinished(): Promise<{ count: number; oldest: Date | null }> {
    const row = await this.dataSource
      .getRepository(TranscodingJobEntity)
      .createQueryBuilder('job')
      .select('COUNT(*)', 'count')
      .addSelect("MIN((job.payload->>'timestamp')::bigint)", 'oldest')
      .where('job.status IN (:...statuses)', {
        statuses: ['pending', 'processing'],
      })
      .getRawOne();
    return {
      count: Number(row.count),
      oldest: row.oldest ? new Date(Number(row.oldest)) : null,
    };
  }

  async claim(jobId: string, videoId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TranscodingJobEntity);
      const job = await repository.findOne({
        where: { id: jobId, videoId },
        lock: { mode: 'pessimistic_write' },
      });
      // Deleting a video cascades to its job. 410 tells the worker to discard
      // the message, while a 404 means a routing error and is retried.
      if (!job) throw new GoneException('Transcoding job not found');
      if (job.status === 'ready') return { status: 'completed' as const };
      // Final: a failure no attempt can fix, or a video played from its source.
      if (job.status === 'failed' && job.result?.permanent)
        return { status: 'completed' as const };
      if (job.leaseExpiresAt && job.leaseExpiresAt.getTime() > Date.now()) {
        throw new ConflictException('Transcoding job is already running');
      }
      // Bounds the runs of a job that keeps failing, whatever redelivers it.
      if (job.attempts >= this.maxAttempts) {
        const error = `Transcoding abandoned after ${job.attempts} attempts`;
        job.status = 'failed';
        job.leaseToken = null;
        job.leaseExpiresAt = null;
        job.result = {
          jobId: job.id,
          videoId: job.videoId,
          success: false,
          duration: 0,
          error,
          processedAt: Date.now(),
          permanent: true,
          reason: 'max_attempts',
        };
        await repository.save(job);
        await manager.update(VideoEntity, job.videoId, {
          transcoding_status: 'failed',
          transcoding_error: error,
        });
        this.logger.warn(`Transcoding job ${job.id}: ${error}`);
        return { status: 'completed' as const };
      }
      job.status = 'processing';
      job.leaseToken = randomUUID();
      job.leaseExpiresAt = new Date(Date.now() + this.leaseSeconds * 1000);
      job.attempts += 1;
      await repository.save(job);
      await manager.update(VideoEntity, job.videoId, {
        transcoding_status: 'pending',
        transcoding_error: null,
      });
      return {
        status: 'claimed' as const,
        leaseToken: job.leaseToken,
        leaseExpiresAt: job.leaseExpiresAt.toISOString(),
        job: job.payload,
      };
    });
  }

  async complete(
    jobId: string,
    leaseToken: string,
    result: VideoTranscodingResult,
  ): Promise<void> {
    if (result.jobId !== jobId)
      throw new BadRequestException('Result does not match the job');
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TranscodingJobEntity);
      const job = await repository.findOne({
        where: { id: jobId, videoId: result.videoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) throw new GoneException('Transcoding job not found');
      // A delayed failure or repeated callback must never overwrite a success.
      if (job.status === 'ready') return;
      if (
        job.status === 'failed' &&
        job.leaseToken === leaseToken &&
        !result.success
      )
        return;
      if (
        job.leaseToken !== leaseToken ||
        !job.leaseExpiresAt ||
        job.leaseExpiresAt.getTime() <= Date.now()
      ) {
        throw new ConflictException('Transcoding lease expired or replaced');
      }
      job.status = result.success ? 'ready' : 'failed';
      job.result = result;
      job.leaseExpiresAt = null;
      // Retain this attempt's token to acknowledge a repeated failure callback.
      await repository.save(job);
      await manager.update(
        VideoEntity,
        job.videoId,
        result.success
          ? {
              duration: result.duration,
              transcoding_status: 'ready',
              transcoding_error: null,
              ...(result.subtitle_id !== undefined
                ? { subtitle_id: result.subtitle_id }
                : {}),
            }
          : this.failedVideo(job, result),
      );
    });
  }

  private failedVideo(
    job: TranscodingJobEntity,
    result: VideoTranscodingResult,
  ): Partial<VideoEntity> {
    const error = result.error || 'Transcoding failed';
    if (!result.permanent || !SOURCE_PLAYBACK_REASONS.has(result.reason))
      return { transcoding_status: 'failed', transcoding_error: error };
    const extension = extname(job.payload.originalKey).slice(1).toLowerCase();
    if (!PLAYABLE_AS_IS.has(extension))
      return {
        transcoding_status: 'failed',
        transcoding_error: `${error}; a .${extension} source cannot be played without transcoding`,
      };
    // As with transcoding disabled: the retained source, through a presigned
    // URL. The worker already wrote the final miniature and subtitle.
    this.logger.warn(
      `Transcoding job ${job.id} (${result.reason}): video ${job.videoId} is played from its source`,
    );
    return {
      media_id: job.payload.originalKey,
      transcoding_status: 'ready',
      transcoding_error: null,
      ...(result.duration > 0 ? { duration: result.duration } : {}),
    };
  }
}
