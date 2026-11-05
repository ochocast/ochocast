import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { RENDER_IN_PROGRESS } from '../../domain/videoEdit';
import {
  VideoEditRenderResult,
  renditionMaster,
} from '../../domain/videoEditRenderJob';
import { VideoEditEntity } from '../gateways/entities/video-edit.entity';
import { VideoEditRenderJobEntity } from './video-edit-render-job.entity';

const seconds = (name: string, fallback: number) =>
  Number(process.env[name] || fallback);

/**
 * Lease and result of montage renders, mirroring RecordingMergeJobsService:
 * a row lock makes claims exclusive, and a repeated or late callback never
 * overwrites a success. A job only acts on the montage version it renders.
 *
 * Montage status: `processing` while claimed, back to `pending` (with the
 * error) between attempts, `ready` with its rendition, or `failed` on a
 * permanent failure, once the attempts are exhausted, or once nothing has
 * run the job for too long. Viewers keep the previous rendition meanwhile.
 */
@Injectable()
export class VideoEditRenderJobsService {
  private readonly logger = new Logger(VideoEditRenderJobsService.name);
  private readonly leaseSeconds = seconds(
    'VIDEO_EDIT_RENDER_LEASE_SECONDS',
    Number(process.env.TRANSCODING_LEASE_SECONDS || 3600),
  );
  readonly maxAttempts = seconds('VIDEO_EDIT_RENDER_MAX_ATTEMPTS', 3);
  // Deliveries that never reach a claim (worker busy, lease running) use up
  // the queue's receive count too: a dead-lettered message would leave the
  // montage pending for ever without this sweep.
  private readonly staleSeconds = seconds(
    'VIDEO_EDIT_RENDER_STALE_SECONDS',
    3 * this.leaseSeconds,
  );
  // Players may still stream a rendition a viewer opened before it was
  // replaced or reverted: its files outlive it this long.
  private readonly orphanGraceSeconds = seconds(
    'VIDEO_EDIT_RENDER_ORPHAN_GRACE_SECONDS',
    24 * 3600,
  );

  constructor(
    private readonly dataSource: DataSource,
    @Inject('s3Client') private readonly s3Client: S3Client,
  ) {
    if (!Number.isInteger(this.leaseSeconds) || this.leaseSeconds < 60) {
      throw new Error(
        'VIDEO_EDIT_RENDER_LEASE_SECONDS must be an integer >= 60',
      );
    }
    if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
      throw new Error('VIDEO_EDIT_RENDER_MAX_ATTEMPTS must be an integer >= 1');
    }
    if (
      !Number.isInteger(this.staleSeconds) ||
      this.staleSeconds <= this.leaseSeconds
    ) {
      throw new Error(
        'VIDEO_EDIT_RENDER_STALE_SECONDS must be an integer above the lease',
      );
    }
    if (
      !Number.isInteger(this.orphanGraceSeconds) ||
      this.orphanGraceSeconds < 0
    ) {
      throw new Error(
        'VIDEO_EDIT_RENDER_ORPHAN_GRACE_SECONDS must be an integer >= 0',
      );
    }
  }

  /** Changes the montage only while it waits for this job's version. */
  private async updateEdit(
    manager: EntityManager,
    job: VideoEditRenderJobEntity,
    changes: Partial<VideoEditEntity>,
  ): Promise<void> {
    await manager.update(
      VideoEditEntity,
      {
        id: job.editId,
        version: job.version,
        render_status: In([...RENDER_IN_PROGRESS]),
      },
      changes,
    );
  }

  private failure(
    job: VideoEditRenderJobEntity,
    error: string,
  ): VideoEditRenderResult {
    return {
      jobId: job.id,
      editId: job.editId,
      success: false,
      duration: 0,
      error,
      permanent: true,
      processedAt: Date.now(),
    };
  }

  async claim(jobId: string, editId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(VideoEditRenderJobEntity);
      const job = await repository.findOne({
        where: { id: jobId, editId },
        lock: { mode: 'pessimistic_write' },
      });
      // Deleting the video cascades to its montage and job: 410 tells the
      // worker to drop the message, while a 404 is a routing error.
      if (!job) throw new GoneException('Render job not found');
      // Failed is final: transient failures go back to pending.
      if (job.status === 'ready' || job.status === 'failed')
        return { status: 'completed' as const };
      if (job.leaseExpiresAt && job.leaseExpiresAt.getTime() > Date.now()) {
        throw new ConflictException('Render job is already running');
      }
      const edit = await manager.findOne(VideoEditEntity, {
        where: { id: editId },
      });
      // A newer version or a stale sweep replaced this render: never run it.
      if (
        !edit ||
        edit.version !== job.version ||
        !RENDER_IN_PROGRESS.includes(edit.render_status)
      ) {
        job.status = 'failed';
        job.leaseExpiresAt = null;
        job.result = this.failure(job, 'Superseded by another render');
        await repository.save(job);
        return { status: 'completed' as const };
      }
      if (job.attempts >= this.maxAttempts) {
        const error = `Render abandoned after ${job.attempts} attempts`;
        job.status = 'failed';
        job.leaseExpiresAt = null;
        job.result = this.failure(job, error);
        await repository.save(job);
        await this.updateEdit(manager, job, {
          render_status: 'failed',
          render_error: error,
        });
        this.logger.warn(`Render job ${job.id}: ${error}`);
        return { status: 'completed' as const };
      }
      job.status = 'processing';
      job.leaseToken = randomUUID();
      job.leaseExpiresAt = new Date(Date.now() + this.leaseSeconds * 1000);
      job.attempts += 1;
      await repository.save(job);
      await this.updateEdit(manager, job, { render_status: 'processing' });
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
    result: VideoEditRenderResult,
  ): Promise<void> {
    if (result.jobId !== jobId)
      throw new BadRequestException('Result does not match the job');
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(VideoEditRenderJobEntity);
      const job = await repository.findOne({
        where: { id: jobId, editId: result.editId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) throw new GoneException('Render job not found');
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
        throw new ConflictException('Render lease expired or replaced');
      }
      // Never trust a key from the worker: it must be this job's folder.
      const master = renditionMaster(job.payload.videoId, job.id);
      if (result.success && result.mediaId !== master) {
        throw new BadRequestException('Unexpected rendered media');
      }
      job.result = result;
      job.leaseExpiresAt = null;
      if (result.success) {
        job.status = 'ready';
        await repository.save(job);
        await this.updateEdit(manager, job, {
          render_status: 'ready',
          render_error: null,
          rendered_media_id: master,
          rendered_duration: result.duration,
        });
      } else if (result.permanent || job.attempts >= this.maxAttempts) {
        job.status = 'failed';
        await repository.save(job);
        await this.updateEdit(manager, job, {
          render_status: 'failed',
          render_error: result.error || 'Render failed',
        });
      } else {
        // The queue redelivers the message; the error is shown meanwhile.
        job.status = 'pending';
        await repository.save(job);
        await this.updateEdit(manager, job, {
          render_status: 'pending',
          render_error: result.error || 'Render failed; retrying',
        });
      }
    });
  }

  /** Last sign of life: the lease end, the last result, or the dispatch. */
  private isStale(job: VideoEditRenderJobEntity, now: number): boolean {
    const lastActivity =
      job.status === 'processing'
        ? job.leaseExpiresAt?.getTime()
        : (job.result?.processedAt ?? job.payload?.timestamp);
    return (
      (job.status === 'pending' || job.status === 'processing') &&
      lastActivity !== undefined &&
      lastActivity < now - this.staleSeconds * 1000
    );
  }

  @Interval(60_000)
  async failStaleJobs(now = Date.now()): Promise<void> {
    try {
      const candidates = await this.dataSource
        .getRepository(VideoEditRenderJobEntity)
        .find({ where: { status: In(['pending', 'processing']) } });
      for (const candidate of candidates) {
        if (!this.isStale(candidate, now)) continue;
        await this.dataSource.transaction(async (manager) => {
          const repository = manager.getRepository(VideoEditRenderJobEntity);
          // Rechecked under the claim's row lock: a claim may have just won.
          const job = await repository.findOne({
            where: { id: candidate.id },
            lock: { mode: 'pessimistic_write' },
          });
          if (!job || !this.isStale(job, now)) return;
          const error = 'No render worker picked the job up any more';
          job.status = 'failed';
          job.leaseExpiresAt = null;
          job.result = { ...this.failure(job, error), processedAt: now };
          await repository.save(job);
          await this.updateEdit(manager, job, {
            render_status: 'failed',
            render_error: error,
          });
          this.logger.warn(`Render job ${job.id} failed: no activity`);
        });
      }
    } catch (error) {
      this.logger.warn(
        `Stale render job sweep deferred: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Deletes the files of finished renders viewers no longer get (replaced,
   * reverted, superseded or failed) once the grace period is over.
   */
  @Interval(3_600_000)
  async removeOrphanRenditions(now = Date.now()): Promise<number> {
    let removed = 0;
    try {
      const jobs = await this.dataSource
        .getRepository(VideoEditRenderJobEntity)
        .find({
          where: {
            status: In(['ready', 'failed']),
            files_deleted_at: IsNull(),
          },
        });
      for (const job of jobs) {
        const finishedAt = job.result?.processedAt;
        if (
          finishedAt === undefined ||
          finishedAt > now - this.orphanGraceSeconds * 1000
        )
          continue;
        // A finished job never becomes the rendition later: this check
        // cannot be undone between here and the deletion.
        const edit = await this.dataSource
          .getRepository(VideoEditEntity)
          .findOne({ where: { id: job.editId } });
        if (
          edit?.rendered_media_id ===
          renditionMaster(job.payload.videoId, job.id)
        )
          continue;
        await this.deletePrefix(`${job.payload.outputPrefix}/`);
        await this.dataSource
          .getRepository(VideoEditRenderJobEntity)
          .update({ id: job.id }, { files_deleted_at: new Date(now) });
        removed++;
      }
    } catch (error) {
      this.logger.warn(
        `Orphan rendition sweep deferred: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    if (removed) this.logger.log(`Removed ${removed} orphan rendition(s)`);
    return removed;
  }

  private async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const listed = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: process.env.STOCK_MEDIA_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects = (listed.Contents || [])
        .filter((object) => object.Key)
        .map((object) => ({ Key: object.Key }));
      if (objects.length) {
        await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: process.env.STOCK_MEDIA_BUCKET,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }
      continuationToken = listed.NextContinuationToken;
    } while (continuationToken);
  }
}
