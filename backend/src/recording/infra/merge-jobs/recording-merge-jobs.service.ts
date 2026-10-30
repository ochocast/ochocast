import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  RecordingMergeJob,
  RecordingMergeResult,
} from '../../domain/recordingMergeJob';
import { RecordingEntity } from '../gateways/entities/recording.entity';
import { RecordingMergeJobEntity } from './recording-merge-job.entity';

/**
 * US-3 — Lease and result of merge jobs, mirroring TranscodingJobsService:
 * a row lock makes claims exclusive, and a repeated or late callback never
 * overwrites a success. The montage stays `processing` while a transient
 * failure is retried, and becomes `failed` on a permanent failure or once
 * the attempts are exhausted.
 */
@Injectable()
export class RecordingMergeJobsService {
  private readonly leaseSeconds = Number(
    process.env.RECORDING_MERGE_LEASE_SECONDS ||
      process.env.TRANSCODING_LEASE_SECONDS ||
      3600,
  );
  private readonly maxAttempts = Number(
    process.env.RECORDING_MERGE_MAX_ATTEMPTS || 5,
  );

  constructor(private readonly dataSource: DataSource) {
    if (!Number.isInteger(this.leaseSeconds) || this.leaseSeconds < 60) {
      throw new Error('RECORDING_MERGE_LEASE_SECONDS must be an integer >= 60');
    }
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('RECORDING_MERGE_MAX_ATTEMPTS must be an integer >= 1');
    }
  }

  async register(
    job: RecordingMergeJob,
    manager: EntityManager = this.dataSource.manager,
  ): Promise<void> {
    await manager.getRepository(RecordingMergeJobEntity).insert({
      id: job.jobId,
      recordingId: job.recordingId,
      payload: job,
      status: 'pending',
      attempts: 0,
    });
  }

  async claim(jobId: string, recordingId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RecordingMergeJobEntity);
      const job = await repository.findOne({
        where: { id: jobId, recordingId },
        lock: { mode: 'pessimistic_write' },
      });
      // A deleted montage cascades to its job: 410 tells the worker to drop
      // the message, while a 404 means a routing error and is retried.
      if (!job) throw new GoneException('Merge job not found');
      // A montage that failed for good is never retried: the organizer goes
      // back and merges again.
      if (job.status === 'ready' || job.status === 'failed')
        return { status: 'completed' as const };
      if (job.leaseExpiresAt && job.leaseExpiresAt.getTime() > Date.now()) {
        throw new ConflictException('Merge job is already running');
      }
      // Give up on a montage that keeps failing; the organizer can retry.
      if (job.attempts >= this.maxAttempts) {
        job.status = 'failed';
        job.leaseExpiresAt = null;
        await repository.save(job);
        await manager.update(RecordingEntity, job.recordingId, {
          status: 'failed',
        });
        return { status: 'completed' as const };
      }
      job.status = 'processing';
      job.leaseToken = randomUUID();
      job.leaseExpiresAt = new Date(Date.now() + this.leaseSeconds * 1000);
      job.attempts += 1;
      await repository.save(job);
      await manager.update(RecordingEntity, job.recordingId, {
        status: 'processing',
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
    result: RecordingMergeResult,
  ): Promise<void> {
    if (result.jobId !== jobId)
      throw new BadRequestException('Result does not match the job');
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RecordingMergeJobEntity);
      const job = await repository.findOne({
        where: { id: jobId, recordingId: result.recordingId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) throw new GoneException('Merge job not found');
      // A delayed failure or repeated callback must never overwrite a success.
      if (job.status === 'ready') return;
      // The failure of this lease is already stored (repeated callback).
      if (
        !result.success &&
        job.leaseToken === leaseToken &&
        !job.leaseExpiresAt
      )
        return;
      if (
        job.leaseToken !== leaseToken ||
        !job.leaseExpiresAt ||
        job.leaseExpiresAt.getTime() <= Date.now()
      ) {
        throw new ConflictException('Merge lease expired or replaced');
      }
      job.result = result;
      job.leaseExpiresAt = null;
      if (result.success) {
        job.status = 'ready';
        await repository.save(job);
        await manager.update(RecordingEntity, job.recordingId, {
          status: 'ready',
          duration: result.duration,
        });
      } else if (result.permanent || job.attempts >= this.maxAttempts) {
        job.status = 'failed';
        await repository.save(job);
        await manager.update(RecordingEntity, job.recordingId, {
          status: 'failed',
        });
      } else {
        // The queue redelivers the message: the montage stays `processing`
        // instead of flickering to `failed` between attempts.
        job.status = 'pending';
        await repository.save(job);
      }
    });
  }
}
