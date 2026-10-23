import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { isUUID } from 'class-validator';
import { VideoUpload } from './upload.entity';
import { MultipartStorage, StoredPart } from './multipart-storage';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { VideoEntity } from '../infra/gateways/entities/video.entity';
import { QueueService } from 'src/queue/queue.service';
import { VideoTranscodingJob } from 'src/queue/job.types';
import {
  PLAYABLE_AS_IS,
  planVideoMedia,
  prepareMiniature,
  uploadMaxBytes,
} from 'src/queue/transcoding-plan';
import { TranscodingJobsService } from 'src/transcoding-jobs/transcoding-jobs.service';
import { TranscodingJobEntity } from 'src/transcoding-jobs/transcoding-job.entity';
import {
  abandonedResult,
  finalFailureReason,
} from 'src/transcoding-jobs/transcoding-outcome';
import { VideoGateway } from '../infra/gateways/video.gateway';
import { parseVideoLists } from '../domain/videoLists';

export function validateParts(s: VideoUpload, parts: StoredPart[]) {
  const count = Math.ceil(Number(s.size) / s.partSize);
  if (parts.length !== count)
    throw new BadRequestException('Missing upload parts');
  parts.forEach((p, i) => {
    const expected = Math.min(s.partSize, Number(s.size) - i * s.partSize);
    if (
      p.PartNumber !== i + 1 ||
      p.Size !== expected ||
      !p.ETag ||
      !s.checksums[i + 1]
    )
      throw new BadRequestException('Invalid part number, size or manifest');
    if (s.checksumMode === 'sha256' && p.ChecksumSHA256 !== s.checksums[i + 1])
      throw new BadRequestException('Part checksum mismatch');
  });
}
function positiveInteger(name: string, fallback: number) {
  const value = Number(process.env[name] || fallback);
  if (!Number.isInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`);
  return value;
}
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private sweeping = false;
  // A pending job not claimed within this delay lost its message.
  private readonly redispatchAfterMs =
    positiveInteger('TRANSCODING_REDISPATCH_AFTER_SECONDS', 7200) * 1000;
  private readonly maxAttempts = positiveInteger(
    'TRANSCODING_MAX_ATTEMPTS',
    10,
  );
  constructor(
    private readonly db: DataSource,
    private readonly storage: MultipartStorage,
    private readonly queue: QueueService,
    private readonly jobs: TranscodingJobsService,
  ) {}

  private async owner(email: string, m = this.db.manager) {
    if (!email) throw new UnauthorizedException();
    const user = await m.findOneBy(UserEntity, { email });
    if (!user) throw new UnauthorizedException();
    return user;
  }
  private async locked<T>(
    id: string,
    email: string,
    action: (s: VideoUpload, m: EntityManager) => Promise<T>,
  ) {
    // Check UUID before PostgreSQL conversion, without leaking another user's session.
    if (!isUUID(id)) throw new NotFoundException();
    return this.db.transaction(async (m) => {
      const owner = await this.owner(email, m);
      const s = await m.findOne(VideoUpload, {
        where: { id, ownerId: owner.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!s) throw new NotFoundException();
      return action(s, m);
    });
  }
  private active(s: VideoUpload) {
    if (s.state !== 'uploading' || s.expiresAt.getTime() <= Date.now())
      throw new GoneException('Upload expired or closed');
  }
  async create(email: string, input: { size: number; filename: string }) {
    const owner = await this.owner(email);
    const max = uploadMaxBytes();
    if (
      !Number.isSafeInteger(input.size) ||
      input.size < 1 ||
      input.size > max ||
      typeof input.filename !== 'string' ||
      !input.filename.length ||
      input.filename.length > 255
    )
      throw new BadRequestException('Invalid filename or upload size');
    const extension = extname(input.filename)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '');
    // Without transcoding the source itself is published: only video containers.
    if (!this.queue.enabled && !PLAYABLE_AS_IS.has(extension.slice(1)))
      throw new BadRequestException('Unsupported video format');
    // Serialize per-owner creation to bound abandoned sessions even across API replicas.
    return this.db.transaction(async (m) => {
      await m.findOne(UserEntity, {
        where: { id: owner.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        (await m.countBy(VideoUpload, {
          ownerId: owner.id,
          state: 'uploading',
        })) >= 5
      )
        throw new ConflictException(
          'Too many active uploads; cancel or wait for expiry',
        );
      const id = randomUUID();
      const mode = process.env.UPLOAD_CHECKSUM_MODE || 'sha256';
      if (!['sha256', 'etag'].includes(mode))
        throw new Error('Invalid UPLOAD_CHECKSUM_MODE');
      const s = m.create(VideoUpload, {
        id,
        ownerId: owner.id,
        // Preserve the extension so the browser can select its native player.
        key: `${id}/source/original${extension || '.video'}`,
        filename: input.filename,
        size: String(input.size),
        partSize: Math.max(16 * 1024 ** 2, Math.ceil(input.size / 10000)),
        checksumMode: mode,
        state: 'uploading',
        checksums: {},
        expiresAt: new Date(Date.now() + 24 * 3600_000),
      });
      s.uploadId = await this.storage.create(s);
      try {
        await m.save(s);
      } catch (e) {
        await this.storage.abort(s).catch(() => undefined);
        throw e;
      }
      return this.view(s, []);
    });
  }
  private view(s: VideoUpload, parts: StoredPart[]) {
    return {
      id: s.id,
      size: Number(s.size),
      filename: s.filename,
      partSize: s.partSize,
      checksumMode: s.checksumMode,
      state: s.state,
      expiresAt: s.expiresAt,
      parts: parts.map((p) => ({
        number: p.PartNumber,
        size: p.Size,
        checksum: s.checksums[p.PartNumber],
      })),
    };
  }
  async status(id: string, email: string) {
    return this.locked(id, email, async (s) => {
      if (s.state !== 'uploading') return this.view(s, []);
      this.active(s);
      try {
        return this.view(s, await this.storage.parts(s));
      } catch (e) {
        if (e.name !== 'NoSuchUpload') throw e;
        await this.verify(s); // Complete succeeded but its response/DB transaction was lost.
        return {
          ...this.view(
            s,
            Object.keys(s.checksums).map((n) => ({
              PartNumber: Number(n),
              ETag: '',
              Size: Math.min(
                s.partSize,
                Number(s.size) - (Number(n) - 1) * s.partSize,
              ),
            })),
          ),
          // Keep uploading until metadata and the job are committed. The browser
          // will reuse these verified parts and retry /complete after a DB failure.
          state: s.state,
        };
      }
    });
  }
  async sign(id: string, email: string, number: number, checksum: string) {
    return this.locked(id, email, async (s, m) => {
      this.active(s);
      if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > Math.ceil(Number(s.size) / s.partSize) ||
        typeof checksum !== 'string' ||
        !/^[A-Za-z0-9+/]{43}=$/.test(checksum)
      )
        throw new BadRequestException('Invalid part');
      if (s.checksums[number] && s.checksums[number] !== checksum)
        throw new ConflictException('Different file selected for resume');
      s.checksums[number] = checksum;
      await m.save(s);
      return {
        url: await this.storage.sign(s, number, checksum),
        headers:
          s.checksumMode === 'sha256'
            ? { 'x-amz-checksum-sha256': checksum }
            : {},
      };
    });
  }
  private async verify(s: VideoUpload) {
    const head = await this.storage.head(s);
    if (head.size !== Number(s.size) || head.session !== s.id)
      throw new BadRequestException('Object verification failed');
  }
  async complete(
    id: string,
    email: string,
    fields: Record<string, any>,
    files: Express.Multer.File[] = [],
  ) {
    const result = await this.locked(id, email, async (s, m) => {
      if (s.state === 'uploaded' || s.state === 'queued') return { id: s.id };
      this.active(s);
      // Opened while transcoding was enabled, the session may hold any file.
      if (!this.queue.enabled && !PLAYABLE_AS_IS.has(extname(s.key).slice(1)))
        throw new BadRequestException('Unsupported video format');
      if (
        typeof fields.title !== 'string' ||
        !fields.title.trim() ||
        fields.title.length > 500
      )
        throw new BadRequestException('Title required (max 500 characters)');
      const { tags, speakers } = parseVideoLists(
        fields.tags,
        fields.internal_speakers,
      );
      const miniature = files.find((f) => f.fieldname === 'miniature');
      const subtitle = files.find((f) => f.fieldname === 'subtitle');
      let subtitleBuffer: Buffer;
      if (subtitle) {
        if (!/\.(srt|vtt)$/i.test(subtitle.originalname))
          throw new BadRequestException('Expected SRT or VTT');
        let content = subtitle.buffer
          .toString('utf8')
          .replace(/^\uFEFF/, '')
          .replace(/\r\n?/g, '\n')
          .trim();
        if (/\.srt$/i.test(subtitle.originalname))
          content = content.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        if (!content.startsWith('WEBVTT')) content = `WEBVTT\n\n${content}`;
        subtitleBuffer = Buffer.from(`${content}\n`);
        // Match the worker's download cap, including normalization overhead.
        if (subtitleBuffer.length > 4 * 1024 ** 2)
          throw new BadRequestException('Subtitle exceeds 4 MiB');
      }
      // Never trust ETags, sizes, keys or creator supplied by the browser.
      try {
        const parts = await this.storage.parts(s);
        validateParts(s, parts);
        await this.storage.complete(s, parts);
      } catch (e) {
        if (e.name !== 'NoSuchUpload') throw e;
      }
      await this.verify(s);
      // Decoded only once the upload is known to be complete and valid.
      const thumbnail = await prepareMiniature(miniature, this.queue.enabled);
      if (miniature && !thumbnail)
        this.logger.warn(`Upload ${s.id}: miniature is not an image, ignored`);
      const plan = planVideoMedia(s.id, s.key, this.queue.enabled, {
        miniature: !!thumbnail,
        subtitle: !!subtitle,
      });
      if (thumbnail)
        await this.storage.put(
          process.env.STOCK_MINIATURE_BUCKET,
          plan.miniatureKey,
          thumbnail.body,
          thumbnail.contentType,
        );
      if (subtitleBuffer)
        await this.storage.put(
          process.env.STOCK_MEDIA_BUCKET,
          plan.subtitleKey,
          subtitleBuffer,
          'text/vtt',
        );
      const video = new VideoEntity({
        id: s.id,
        media_id: plan.media_id,
        miniature_id: plan.miniature_id,
        subtitle_id: plan.subtitle_id,
        title: fields.title.trim(),
        description: String(fields.description || ''),
        // Raw entries: createNewVideo resolves them against stored rows.
        tags: tags as TagEntity[],
        internal_speakers: speakers as UserEntity[],
        external_speakers: String(fields.external_speakers || ''),
        creator: { id: s.ownerId } as UserEntity,
        createdAt: new Date(),
        updatedAt: new Date(),
        views: 0,
        comments: [],
        archived: false,
        transcoding_status: plan.transcoding_status,
      });
      // Reuse relation normalization, on this transaction's repository.
      await new VideoGateway(m.getRepository(VideoEntity), null).createNewVideo(
        video as any,
      );
      if (this.queue.enabled) {
        const job: VideoTranscodingJob = {
          // One immutable job per upload. At-least-once delivery reuses this ID.
          jobId: s.id,
          videoId: s.id,
          originalFileName: s.filename,
          originalKey: s.key,
          miniatureSourceKey: plan.miniatureKey,
          subtitleSourceKey: plan.subtitleKey,
          media_id: video.media_id,
          miniature_id: video.miniature_id,
          subtitle_id: plan.subtitle_id,
          title: video.title,
          timestamp: Date.now(),
        };
        await this.jobs.register(job, m);
      }
      // uploaded also means a durable publication is waiting; queued means sent.
      // Without a queue, uploaded is final: the source is already playable.
      s.state = 'uploaded';
      s.completedAt = new Date();
      await m.save(s);
      return { id: s.id };
    });
    if (this.queue.enabled) await this.dispatch(result.id);
    return result;
  }

  private async dispatch(id: string) {
    try {
      // This is a separate transaction: the video and job are already committed.
      // Serializing the upload row prevents concurrent API replicas sending it twice.
      await this.db.transaction(async (m) => {
        const s = await m.findOne(VideoUpload, {
          where: { id, state: 'uploaded' },
          lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' },
        });
        if (!s) return;
        const job = await m.findOneBy(TranscodingJobEntity, { id });
        if (!job) return; // Completed uploads from before FFmpeg remain readable.
        if (job.status === 'pending') {
          // Dated at publication: reconciliation then waits a full delay.
          job.payload = { ...job.payload, timestamp: Date.now() };
          await m.save(job);
          await this.queue.publishRegisteredJob(job.payload);
        }
        s.state = 'queued';
        await m.save(s);
      });
    } catch (e) {
      // No source or metadata rollback: a later sweep retries with the same jobId.
      this.logger.warn(
        `Transcoding publication deferred for ${id}: ${e.message}`,
      );
    }
  }

  async cancel(id: string, email: string) {
    return this.locked(id, email, async (s, m) => {
      if (s.state === 'aborted') return;
      if (s.state === 'uploaded' || s.state === 'queued' || s.state === 'ready')
        throw new ConflictException('Upload already completed');
      await this.storage.abort(s);
      await this.storage.remove(s); // Also handles a lost Complete response.
      s.state = 'aborted';
      await m.save(s);
    });
  }
  @Interval(5000)
  async maintain() {
    if (this.sweeping) return;
    this.sweeping = true;
    // Independent phases: a failure in one never holds back the others.
    try {
      await this.expireSessions().catch((e) =>
        this.logger.warn(`Expired upload cleanup deferred: ${e.message}`),
      );
      // Jobs left by an earlier enabled run are reported once at boot instead.
      if (!this.queue.enabled) return;
      // Before re-dispatch, so a job is never published twice in one sweep.
      await this.reconcileJobs().catch((e) =>
        this.logger.warn(
          `Transcoding job reconciliation deferred: ${e.message}`,
        ),
      );
      await this.redispatchUploaded().catch((e) =>
        this.logger.warn(`Upload re-dispatch deferred: ${e.message}`),
      );
    } finally {
      this.sweeping = false;
    }
  }

  private async expireSessions() {
    await this.db.transaction(async (m) => {
      const expired = await m
        .createQueryBuilder(VideoUpload, 's')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where("s.state = 'uploading' AND s.expiresAt < :now", {
          now: new Date(),
        })
        .orderBy('s.expiresAt', 'ASC')
        .take(10)
        .getMany();
      for (const s of expired) {
        await this.storage.abort(s);
        await this.storage.remove(s);
        s.state = 'aborted';
        await m.save(s);
      }
    });
  }

  private async redispatchUploaded() {
    const pending = await this.db
      .getRepository(VideoUpload)
      .createQueryBuilder('s')
      .innerJoin(TranscodingJobEntity, 'job', 'job.id = s.id')
      .where("s.state = 'uploaded'")
      .orderBy('s.completedAt', 'ASC')
      .take(10)
      .getMany();
    for (const s of pending) await this.dispatch(s.id);
  }

  // Jobs whose message was lost or dead-lettered: never claimed, claimed by a
  // worker that died, or failed with an error marked retryable whose
  // redeliveries ran out, counted from the failure (its message may still be
  // redelivered right after it, whenever it was published). Failures an older backend recorded carry no marker
  // and stay final. Uploads still 'uploaded' are left to re-dispatch, and
  // recordings, which have no upload row, are included.
  private async reconcileJobs() {
    await this.db.transaction(async (m) => {
      const now = Date.now();
      const stale = await m
        .createQueryBuilder(TranscodingJobEntity, 'job')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where(
          "((job.status = 'processing' AND job.leaseExpiresAt < :leaseCutoff)" +
            " OR (job.status = 'pending' AND (job.payload->>'timestamp')::bigint < :pendingCutoff)" +
            " OR (job.status = 'failed' AND job.result->>'retryable' = 'true'" +
            " AND (job.result->>'processedAt')::bigint < :pendingCutoff))" +
            " AND NOT EXISTS (SELECT 1 FROM video_upload u WHERE u.id = job.id AND u.state = 'uploaded')",
          {
            leaseCutoff: new Date(now - 10 * 60_000),
            pendingCutoff: now - this.redispatchAfterMs,
          },
        )
        .orderBy("(job.payload->>'timestamp')::bigint", 'ASC')
        .limit(10)
        .getMany();
      for (const job of stale) {
        job.leaseToken = null;
        job.leaseExpiresAt = null;
        if (job.attempts >= this.maxAttempts) {
          // Final like claim's abandonment: later deliveries are acknowledged.
          job.status = 'failed';
          job.result = abandonedResult(job, now);
          await m.save(job);
          await m.update(VideoEntity, job.videoId, {
            transcoding_status: 'failed',
            transcoding_error: finalFailureReason(job.result.reason),
          });
          this.logger.warn(`Transcoding job ${job.id}: ${job.result.error}`);
          continue;
        }
        const payload = { ...job.payload, timestamp: now };
        try {
          await this.queue.publishRegisteredJob(payload);
        } catch (e) {
          // Saved only once sent: this job stays a candidate for the next
          // sweep, and jobs already handled in this batch stay committed.
          this.logger.warn(
            `Transcoding job ${job.id} republication deferred: ${e.message}`,
          );
          break;
        }
        job.status = 'pending';
        job.payload = payload;
        await m.save(job);
        // It will run again: a video an older backend failed meanwhile, e.g.
        // when a recording's first publication failed, is pending again.
        await m.update(
          VideoEntity,
          { id: job.videoId, transcoding_status: 'failed' },
          { transcoding_status: 'pending', transcoding_error: null },
        );
        this.logger.log(`Transcoding job ${job.id} republished`);
      }
    });
  }
}
