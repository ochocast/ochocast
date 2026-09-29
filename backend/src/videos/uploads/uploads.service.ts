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
import { VideoEntity } from '../infra/gateways/entities/video.entity';
import { VideoGateway } from '../infra/gateways/video.gateway';

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
@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private sweeping = false;
  constructor(
    private readonly db: DataSource,
    private readonly storage: MultipartStorage,
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
    const max = Number(process.env.UPLOAD_MAX_BYTES || 20 * 1024 ** 3);
    if (!Number.isSafeInteger(max) || max < 1 || max > 50 * 1024 ** 3)
      throw new Error('UPLOAD_MAX_BYTES must be between 1 byte and 50 GiB');
    if (
      !Number.isSafeInteger(input.size) ||
      input.size < 1 ||
      input.size > max ||
      typeof input.filename !== 'string' ||
      !input.filename.length ||
      input.filename.length > 255
    )
      throw new BadRequestException('Invalid filename or upload size');
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
      const extension = extname(input.filename)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, '');
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
          state: 'uploaded',
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
    return this.locked(id, email, async (s, m) => {
      if (s.state === 'uploaded') return { id: s.id }; // Same response after HTTP retry.
      this.active(s);
      if (
        typeof fields.title !== 'string' ||
        !fields.title.trim() ||
        fields.title.length > 500
      )
        throw new BadRequestException('Title required (max 500 characters)');
      let tags, speakers;
      try {
        tags = JSON.parse(fields.tags || '[]');
        speakers = JSON.parse(fields.internal_speakers || '[]');
        if (
          !Array.isArray(tags) ||
          !Array.isArray(speakers) ||
          tags.length > 100 ||
          speakers.length > 100
        )
          throw new Error();
      } catch {
        throw new BadRequestException('Invalid tags or speakers');
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
      const miniature = files.find((f) => f.fieldname === 'miniature');
      const subtitle = files.find((f) => f.fieldname === 'subtitle');
      const miniatureKey = miniature ? `miniature-${s.id}.jpg` : undefined;
      const subtitleId = subtitle ? `subtitle-${s.id}.vtt` : undefined;
      if (miniature)
        await this.storage.put(
          process.env.STOCK_MINIATURE_BUCKET,
          miniatureKey,
          miniature.buffer,
          miniature.mimetype,
        );
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
        await this.storage.put(
          process.env.STOCK_MEDIA_BUCKET,
          subtitleId,
          Buffer.from(`${content}\n`),
          'text/vtt',
        );
      }
      const video = new VideoEntity({
        id: s.id,
        media_id: s.key,
        miniature_id: `miniature-${s.id}.jpg`,
        subtitle_id: subtitleId,
        title: fields.title.trim(),
        description: String(fields.description || ''),
        tags,
        internal_speakers: speakers,
        external_speakers: String(fields.external_speakers || ''),
        creator: { id: s.ownerId } as UserEntity,
        createdAt: new Date(),
        updatedAt: new Date(),
        views: 0,
        comments: [],
        archived: false,
        // Multipart persists the source file directly; transcoding is a later feature.
        transcoding_status: 'ready',
      });
      // Reuse relation normalization, on this transaction's repository.
      await new VideoGateway(m.getRepository(VideoEntity), null).createNewVideo(
        video as any,
      );
      // Upload completion means the original object and metadata are durable.
      s.state = 'uploaded';
      s.completedAt = new Date();
      await m.save(s);
      return { id: s.id };
    });
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
    try {
      await this.db.transaction(async (m) => {
        const expired = await m
          .createQueryBuilder(VideoUpload, 's')
          .setLock('pessimistic_write')
          .setOnLocked('skip_locked')
          .where("s.state = 'uploading' AND s.expiresAt < :now", {
            now: new Date(),
          })
          .take(10)
          .getMany();
        for (const s of expired) {
          await this.storage.abort(s);
          await this.storage.remove(s);
          s.state = 'aborted';
          await m.save(s);
        }
      });
    } catch (e) {
      this.logger.warn(`Upload maintenance deferred: ${e.message}`);
    } finally {
      this.sweeping = false;
    }
  }
}
