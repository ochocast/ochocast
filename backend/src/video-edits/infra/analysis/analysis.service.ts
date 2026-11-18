import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { VideoEntity } from 'src/videos/infra/gateways/entities/video.entity';
import { IVideoEditGateway } from '../../domain/gateways/video-edits.gateway';
import {
  editableDuration,
  getEditableVideo,
} from '../../domain/videoEditAccess';
import {
  AnalysisResult,
  analysisSettings,
} from '../../domain/videoEditAnalysis';
import { VideoEditRenderDispatcher } from '../render-jobs/video-edit-render-dispatcher';
import { AnalysisJobEntity } from './analysis-job.entity';

export const analysisFingerprint = (
  key: string,
  etag: string,
  bytes: number,
  noiseDb: number,
  silence: number,
) =>
  createHash('sha256')
    .update(
      JSON.stringify(['silencedetect-v1', key, etag, bytes, noiseDb, silence]),
    )
    .digest('hex');
const active = ['pending', 'processing'];

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly settings = analysisSettings();
  private readonly enabled = process.env.VIDEO_EDIT_ANALYSIS_ENABLED === 'true';
  private maintaining = false;
  constructor(
    private readonly db: DataSource,
    @Inject('VideoGateway') private readonly videos: IVideoGateway,
    @Inject('UserGateway') private readonly users: IUserGateway,
    @Inject('VideoEditGateway') private readonly edits: IVideoEditGateway,
    @Inject('VideoEditRenderDispatcher')
    private readonly dispatcher: VideoEditRenderDispatcher,
    @Inject('s3Client') private readonly s3: S3Client,
  ) {}
  private access(videoId: string, email: string) {
    return getEditableVideo(
      { videoGateway: this.videos, userGateway: this.users },
      videoId,
      email,
    );
  }
  private view(job: AnalysisJobEntity, reused?: 'active' | 'cache') {
    return {
      id: job.id,
      videoId: job.videoId,
      status: job.status,
      phase: job.phase,
      settings: job.payload.settings,
      duration: job.payload.duration,
      processedSeconds: job.processedSeconds,
      progress:
        job.status === 'ready'
          ? 100
          : Math.min(99, (100 * job.processedSeconds) / job.payload.duration),
      queuedAt: job.createdAt,
      updatedAt: job.updatedAt,
      attempts: job.attempts,
      result: job.result,
      reused,
    };
  }
  async request(videoId: string, email: string) {
    const video = await this.access(videoId, email);
    if (!this.enabled || !this.dispatcher.enabled)
      throw new ServiceUnavailableException('Silence analysis is not enabled');
    const requester = await this.users.getUserByEmail(email);
    const duration = editableDuration(video);
    if (duration === null) throw new ConflictException('Video is not ready');
    const sourceKey = await this.edits.findSourceKey(videoId, video.media_id);
    if (!sourceKey) throw new ConflictException('Video has no original file');
    let head;
    try {
      head = await this.s3.send(
        new HeadObjectCommand({
          Bucket: process.env.STOCK_MEDIA_BUCKET,
          Key: sourceKey,
        }),
      );
    } catch (error) {
      if (error.$metadata?.httpStatusCode === 404)
        throw new ConflictException('Video has no original file');
      throw new ServiceUnavailableException('Could not inspect original');
    }
    if (
      !head.ETag ||
      !Number.isSafeInteger(head.ContentLength) ||
      head.ContentLength <= 0
    )
      throw new ConflictException('Invalid original');
    const fingerprint = analysisFingerprint(
      sourceKey,
      head.ETag,
      head.ContentLength,
      this.settings.noiseDb,
      this.settings.minSilenceSeconds,
    );
    const { job, reused } = await this.db.transaction(async (manager) => {
      // Serialize all requests for this video, across backend replicas. The partial
      // unique index is the second line of defence (also for different settings).
      const parent = await manager.findOne(VideoEntity, {
        where: { id: videoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!parent || parent.archived)
        throw new NotFoundException('Video not found');
      const repo = manager.getRepository(AnalysisJobEntity);
      const running = await repo
        .createQueryBuilder('job')
        .where('job.videoId = :videoId', { videoId })
        .andWhere('job.status IN (:...active)', { active })
        .getOne();
      if (running) return { job: running, reused: 'active' as const };
      const cached = await repo
        .createQueryBuilder('job')
        .where('job.videoId = :videoId AND job.fingerprint = :fingerprint', {
          videoId,
          fingerprint,
        })
        .andWhere("job.status = 'ready' AND job.expiresAt > :now", {
          now: new Date(),
        })
        .orderBy('job.createdAt', 'DESC')
        .getOne();
      if (cached) return { job: cached, reused: 'cache' as const };
      const jobId = randomUUID();
      const created = repo.create({
        id: jobId,
        videoId,
        requestedBy: requester.id,
        fingerprint,
        payload: {
          type: 'silence_analysis',
          jobId,
          videoId,
          timestamp: Date.now(),
          sourceKey,
          sourceEtag: head.ETag,
          sourceBytes: head.ContentLength,
          duration,
          settings: this.settings,
        },
        status: 'pending',
        phase: 'queued',
        processedSeconds: 0,
        attempts: 0,
        nextDispatchAt: new Date(),
        publishedAt: null,
        leaseToken: null,
        leaseExpiresAt: null,
        expiresAt: null,
        result: null,
      });
      return { job: await repo.save(created), reused: undefined };
    });
    if (!reused) await this.dispatch(job.id);
    return this.view(job, reused);
  }
  async get(videoId: string, email: string, jobId?: string) {
    const video = await this.access(videoId, email);
    const job = await this.db.getRepository(AnalysisJobEntity).findOne({
      where: { videoId, ...(jobId ? { id: jobId } : {}) },
      order: { createdAt: 'DESC' },
    });
    if (!job || (job.expiresAt && job.expiresAt.getTime() <= Date.now()))
      throw new NotFoundException('No silence analysis');
    if (job.status === 'ready') {
      const key = await this.edits.findSourceKey(videoId, video.media_id);
      if (
        key !== job.payload.sourceKey ||
        job.payload.settings.noiseDb !== this.settings.noiseDb ||
        job.payload.settings.minSilenceSeconds !==
          this.settings.minSilenceSeconds
      )
        throw new NotFoundException('No current silence analysis');
      try {
        const head = await this.s3.send(
          new HeadObjectCommand({
            Bucket: process.env.STOCK_MEDIA_BUCKET,
            Key: key,
          }),
        );
        if (
          head.ETag !== job.payload.sourceEtag ||
          head.ContentLength !== job.payload.sourceBytes
        )
          throw new NotFoundException('Original changed');
      } catch (error) {
        if (error instanceof NotFoundException) throw error;
        throw new ServiceUnavailableException(
          'Could not verify analysis source',
        );
      }
    }
    return this.view(job);
  }
  private async dispatch(id: string) {
    const message = await this.db.transaction(async (manager) => {
      const repo = manager.getRepository(AnalysisJobEntity);
      const job = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !job ||
        job.status !== 'pending' ||
        job.publishedAt ||
        job.nextDispatchAt.getTime() > Date.now()
      )
        return null;
      job.nextDispatchAt = new Date(Date.now() + 60000);
      await repo.save(job);
      const { type, jobId, videoId, timestamp } = job.payload;
      return { type, jobId, videoId, timestamp };
    });
    if (!message) return;
    try {
      await this.dispatcher.publish(message);
      await this.db
        .getRepository(AnalysisJobEntity)
        .update(id, { publishedAt: new Date() });
    } catch (error) {
      // Pending outbox is persisted: restart or temporary queue failure cannot
      // lose the job. A crash after send can duplicate it; claim is idempotent.
      this.logger.warn(
        `Analysis ${id} publication deferred: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  async claim(id: string, videoId: string) {
    return this.db.transaction(async (manager) => {
      const repo = manager.getRepository(AnalysisJobEntity);
      const job = await repo.findOne({
        where: { id, videoId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) throw new GoneException('Analysis job deleted');
      if (!active.includes(job.status)) return { status: 'completed' };
      if (job.leaseExpiresAt && job.leaseExpiresAt.getTime() > Date.now())
        throw new ConflictException('Analysis already running');
      if (job.attempts >= 3) {
        job.status = 'failed';
        job.result = {
          jobId: id,
          success: false,
          permanent: true,
          error: 'Analysis attempts exhausted',
        };
        job.expiresAt = new Date(Date.now() + 86400000);
        await repo.save(job);
        return { status: 'completed' };
      }
      job.status = 'processing';
      job.phase = 'downloading';
      job.attempts++;
      job.processedSeconds = 0;
      job.leaseToken = randomUUID();
      job.leaseExpiresAt = new Date(
        Date.now() + job.payload.settings.timeoutMs + 60000,
      );
      await repo.save(job);
      return {
        status: 'claimed',
        leaseToken: job.leaseToken,
        leaseExpiresAt: job.leaseExpiresAt.toISOString(),
        job: job.payload,
      };
    });
  }
  private async leased(
    id: string,
    token: string,
    action: (job: AnalysisJobEntity) => void,
    terminal = false,
  ) {
    await this.db.transaction(async (manager) => {
      const repo = manager.getRepository(AnalysisJobEntity);
      const job = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!job) throw new GoneException('Analysis job deleted');
      if (
        terminal &&
        job.leaseToken === token &&
        job.result &&
        !job.leaseExpiresAt
      )
        return;
      if (
        job.status !== 'processing' ||
        job.leaseToken !== token ||
        !job.leaseExpiresAt ||
        job.leaseExpiresAt.getTime() <= Date.now()
      )
        throw new ConflictException('Analysis lease expired or replaced');
      action(job);
      await repo.save(job);
    });
  }
  async progress(id: string, token: string, processedSeconds: number) {
    await this.leased(id, token, (job) => {
      if (
        !Number.isFinite(processedSeconds) ||
        processedSeconds < 0 ||
        processedSeconds > job.payload.duration + 2
      )
        throw new BadRequestException('Invalid analysis progress');
      job.phase = 'analyzing';
      job.processedSeconds = Math.max(
        job.processedSeconds,
        Math.min(job.payload.duration, processedSeconds),
      );
    });
  }
  async complete(id: string, token: string, result: AnalysisResult) {
    if (result.jobId !== id)
      throw new BadRequestException('Unexpected analysis job');
    await this.leased(
      id,
      token,
      (job) => {
        if (result.success) {
          const cuts = result.cuts;
          if (
            !Array.isArray(cuts) ||
            cuts.length > 99 ||
            !Number.isFinite(result.duration) ||
            result.duration < 1 ||
            Math.abs(result.duration - job.payload.duration) > 2 ||
            !['cuts', 'no_audio', 'no_silence'].includes(result.outcome) ||
            (result.outcome === 'cuts') !== cuts.length > 0 ||
            cuts.some(
              (cut, i) =>
                !Number.isFinite(cut) ||
                cut < 5 ||
                cut > Math.min(result.duration, job.payload.duration) - 5 ||
                (i > 0 && cut - cuts[i - 1] < 5),
            )
          )
            throw new BadRequestException('Invalid proposed cuts');
          job.status = 'ready';
          job.phase = 'complete';
          job.processedSeconds = job.payload.duration;
        } else {
          job.status =
            result.permanent || job.attempts >= 3 ? 'failed' : 'pending';
          job.phase = 'queued';
          job.publishedAt = null;
          job.nextDispatchAt = new Date(Date.now() + 10000);
        }
        job.result = result;
        job.leaseExpiresAt = null;
        if (!active.includes(job.status))
          job.expiresAt = new Date(Date.now() + 86400000);
      },
      true,
    );
  }
  @Interval(5000)
  async maintain() {
    if (!this.enabled || !this.dispatcher.enabled || this.maintaining) return;
    this.maintaining = true;
    try {
      // A stopped worker is recovered on the analysis lease, not after the
      // shared queue's 3900-second visibility. Old deliveries then complete.
      await this.db
        .getRepository(AnalysisJobEntity)
        .createQueryBuilder()
        .update()
        .set({
          status: 'pending',
          phase: 'queued',
          leaseExpiresAt: null,
          publishedAt: null,
          nextDispatchAt: new Date(),
        })
        .where('status = \'processing\' AND "leaseExpiresAt" < :now', {
          now: new Date(),
        })
        .execute();
      const jobs = await this.db
        .getRepository(AnalysisJobEntity)
        .createQueryBuilder('job')
        .where(
          "job.status = 'pending' AND job.publishedAt IS NULL AND job.nextDispatchAt <= :now",
          { now: new Date() },
        )
        .take(10)
        .getMany();
      for (const job of jobs) await this.dispatch(job.id);
      await this.db
        .getRepository(AnalysisJobEntity)
        .createQueryBuilder()
        .delete()
        .where('"expiresAt" < :now', { now: new Date() })
        .execute();
    } catch (error) {
      this.logger.warn(
        `Analysis maintenance deferred: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.maintaining = false;
    }
  }
}
