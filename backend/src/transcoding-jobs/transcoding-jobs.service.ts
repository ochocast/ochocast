import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  VideoTranscodingJob,
  VideoTranscodingResult,
} from '../queue/job.types';
import { VideoEntity } from '../videos/infra/gateways/entities/video.entity';
import { TranscodingJobEntity } from './transcoding-job.entity';

@Injectable()
export class TranscodingJobsService {
  private readonly leaseSeconds = Number(
    process.env.TRANSCODING_LEASE_SECONDS || 3600,
  );

  constructor(private readonly dataSource: DataSource) {
    if (!Number.isInteger(this.leaseSeconds) || this.leaseSeconds < 60) {
      throw new Error('TRANSCODING_LEASE_SECONDS must be an integer >= 60');
    }
  }

  async register(job: VideoTranscodingJob): Promise<void> {
    await this.dataSource.getRepository(TranscodingJobEntity).insert({
      id: job.jobId,
      videoId: job.videoId,
      payload: job,
      status: 'pending',
      attempts: 0,
    });
  }

  async claim(jobId: string, videoId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TranscodingJobEntity);
      const job = await repository.findOne({
        where: { id: jobId, videoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) throw new NotFoundException('Transcoding job not found');
      if (job.status === 'ready') return { status: 'completed' as const };
      if (job.leaseExpiresAt && job.leaseExpiresAt.getTime() > Date.now()) {
        throw new ConflictException('Transcoding job is already running');
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
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(TranscodingJobEntity);
      const job = await repository.findOne({
        where: { id: jobId, videoId: result.videoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job || result.jobId !== jobId)
        throw new NotFoundException('Transcoding job not found');
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
          : {
              transcoding_status: 'failed',
              transcoding_error: result.error || 'Transcoding failed',
            },
      );
    });
  }
}
