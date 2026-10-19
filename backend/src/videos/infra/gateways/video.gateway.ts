import { IVideoGateway } from '../../domain/gateways/videos.gateway';
import { VideoObject } from '../../domain/video';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Not, Repository } from 'typeorm';
import { VideoEntity } from './entities/video.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import {
  S3Client,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Inject, NotFoundException } from '@nestjs/common';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class VideoGateway implements IVideoGateway {
  constructor(
    @InjectRepository(VideoEntity)
    private readonly videosRepository: Repository<VideoEntity>,
    @Inject('s3Client') private s3Client: S3Client,
  ) {}

  async createNewVideo(videoDetails: VideoObject): Promise<VideoObject> {
    console.log(videoDetails);

    const usersRepository =
      this.videosRepository.manager.getRepository(UserEntity);

    // Normalize creator relation and ensure it exists.
    const creatorId =
      typeof (videoDetails as any).creator === 'string'
        ? (videoDetails as any).creator
        : (videoDetails as any).creator?.id;

    if (!creatorId) {
      throw new Error('Creator is required to create a video');
    }

    const creator = await usersRepository.findOneBy({ id: creatorId });
    if (!creator) {
      throw new Error(`Creator not found: ${creatorId}`);
    }

    const tags = await this.resolveTags(videoDetails.tags);
    const internal_speakers = await this.resolveInternalSpeakers(
      videoDetails.internal_speakers,
    );

    const video: VideoEntity = new VideoEntity({
      ...videoDetails,
      creator,
      tags,
      internal_speakers,
    });

    return await this.videosRepository.save(video);
  }

  getVideos(filter: any): Promise<VideoObject[]> {
    console.log(filter);
    return this.videosRepository.find({
      where: {
        ...filter,
        archived: false,
      },
      relations: ['creator', 'tags', 'internal_speakers'],
      order: {
        createdAt: 'DESC',
      },
    });
  }

  getVideosAdmin(filter: any): Promise<VideoObject[]> {
    return this.videosRepository.find({
      where: {
        ...filter,
      },
      relations: ['creator'],
    });
  }

  async deleteVideo(videoId: string): Promise<VideoObject> {
    const video = await this.videosRepository.findOneBy({ id: videoId });

    video.archived = true;
    return await this.videosRepository.save(video);
  }

  async restoreVideo(videoId: string): Promise<VideoObject> {
    const video = await this.videosRepository.findOneBy({ id: videoId });

    video.archived = false;
    return await this.videosRepository.save(video);
  }

  async deleteVideoAdmin(videoId: string): Promise<VideoObject> {
    const video = await this.videosRepository.findOneBy({ id: videoId });

    console.log('video to delete found !');
    console.log(video);

    if (video.media_id.includes('/')) {
      await this.deleteMediaPrefix(
        process.env.STOCK_MEDIA_BUCKET,
        `${video.id}/`,
      );
    } else {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: process.env.STOCK_MEDIA_BUCKET,
          Key: video.media_id,
        }),
      );
    }

    const miniatureCommand = new DeleteObjectCommand({
      Bucket: process.env.STOCK_MINIATURE_BUCKET,
      Key: video.miniature_id,
    });
    await this.s3Client.send(miniatureCommand);
    // The HTTP worker retains this input for retries; permanent deletion removes it too.
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.STOCK_MINIATURE_BUCKET,
        Key: `${video.id}/source/miniature-original`,
      }),
    );

    // Delete subtitle file if it exists
    if (video.subtitle_id) {
      const subtitleCommand = new DeleteObjectCommand({
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: video.subtitle_id,
      });
      await this.s3Client.send(subtitleCommand);
    }

    return await this.videosRepository.remove(video);
  }

  private async deleteMediaPrefix(
    bucket: string,
    prefix: string,
  ): Promise<void> {
    let continuationToken: string | undefined;
    do {
      const listed = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
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
            Bucket: bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }
      continuationToken = listed.NextContinuationToken;
    } while (continuationToken);
  }

  async modifyVideo(
    video: Partial<VideoObject> & Pick<VideoObject, 'id'>,
  ): Promise<VideoObject> {
    if (!(await this.videosRepository.existsBy({ id: video.id }))) {
      throw new Error(`Video with ID ${video.id} not found`);
    }
    // Only the given columns are written (TypeORM skips undefined ones): a
    // column changed since, such as a transcoding result, keeps its value.
    await this.videosRepository.save(
      this.videosRepository.create({
        ...video,
        ...(video.tags !== undefined
          ? { tags: await this.resolveTags(video.tags) }
          : {}),
        ...(video.internal_speakers !== undefined
          ? {
              internal_speakers: await this.resolveInternalSpeakers(
                video.internal_speakers,
              ),
            }
          : {}),
      }),
    );
    return await this.videosRepository.findOneBy({ id: video.id });
  }

  /**
   * Stored tags for a client list, found by id or case-insensitive name, and
   * new ones created from a trimmed name only. Tags are saved with cascade:
   * a client object would update the shared row and its links to others'
   * videos, so none reaches the save.
   */
  private async resolveTags(raw: unknown): Promise<TagEntity[]> {
    const tagsRepository =
      this.videosRepository.manager.getRepository(TagEntity);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const uniqueTags = new Map<string, TagEntity>();
    for (const rawTag of Array.isArray(parsed) ? parsed : []) {
      const tagId = rawTag?.id;
      const tagName =
        typeof rawTag?.name === 'string' ? rawTag.name.trim() : '';

      let resolvedTag: TagEntity | null = null;

      if (tagId) {
        resolvedTag = await tagsRepository.findOneBy({ id: tagId });
      }

      if (!resolvedTag && tagName) {
        resolvedTag = await tagsRepository
          .createQueryBuilder('tag')
          .where('LOWER(tag.name) = LOWER(:name)', { name: tagName })
          .getOne();
      }

      if (!resolvedTag && tagName) {
        resolvedTag = await tagsRepository.save(
          new TagEntity({
            name: tagName,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        );
      }

      if (resolvedTag) {
        uniqueTags.set(resolvedTag.id, resolvedTag);
      }
    }
    return Array.from(uniqueTags.values());
  }

  /** Stored users for a client list of speakers; unknown ids are dropped. */
  private async resolveInternalSpeakers(raw: unknown): Promise<UserEntity[]> {
    const usersRepository =
      this.videosRepository.manager.getRepository(UserEntity);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const uniqueInternalSpeakers = new Map<string, UserEntity>();
    for (const rawUser of Array.isArray(parsed) ? parsed : []) {
      const userId = rawUser?.id;
      if (!userId) continue;

      const resolvedUser = await usersRepository.findOneBy({ id: userId });
      if (resolvedUser) {
        uniqueInternalSpeakers.set(resolvedUser.id, resolvedUser);
      }
    }
    return Array.from(uniqueInternalSpeakers.values());
  }

  async searchVideo(filter: any): Promise<VideoObject[]> {
    return this.videosRepository
      .createQueryBuilder('video')
      .leftJoinAndSelect('video.tags', 'tag')
      .leftJoinAndSelect('video.creator', 'creator')
      .where('video.archived = false')
      .andWhere(
        new Brackets((qb) => {
          qb.where('video.title ILIKE :filter', { filter: `%${filter}%` })
            .orWhere('video.description ILIKE :filter', {
              filter: `%${filter}%`,
            })
            .orWhere('tag.name ILIKE :filter', { filter: `%${filter}%` })
            .orWhere('creator.firstName ILIKE :filter', {
              filter: `%${filter}%`,
            })
            .orWhere('creator.lastName ILIKE :filter', {
              filter: `%${filter}%`,
            })
            .orWhere('creator.username ILIKE :filter', {
              filter: `%${filter}%`,
            })
            .orWhere('creator.email ILIKE :filter', { filter: `%${filter}%` });
        }),
      )
      .orderBy('video.createdAt', 'DESC')
      .take(20)
      .getMany();
  }

  async searchVideoAdmin(
    filter: any,
    archived?: boolean,
  ): Promise<VideoObject[]> {
    const query = this.videosRepository
      .createQueryBuilder('video')
      .leftJoinAndSelect('video.tags', 'tag')
      .leftJoinAndSelect('video.creator', 'creator')
      .andWhere(
        new Brackets((qb) => {
          qb.where('video.title ILIKE :filter', { filter: `%${filter}%` })
            .orWhere('video.description ILIKE :filter', {
              filter: `%${filter}%`,
            })
            .orWhere('tag.name ILIKE :filter', { filter: `%${filter}%` })
            .orWhere('creator.firstName ILIKE :filter', {
              filter: `%${filter}%`,
            })
            .orWhere('creator.lastName ILIKE :filter', {
              filter: `%${filter}%`,
            })
            .orWhere('creator.username ILIKE :filter', {
              filter: `%${filter}%`,
            })
            .orWhere('creator.email ILIKE :filter', { filter: `%${filter}%` });
        }),
      )
      .orderBy('video.createdAt', 'DESC')
      .take(20);

    if (archived !== undefined) {
      query.andWhere('video.archived = :archived', { archived });
    }
    return query.getMany();
  }

  async incrementVideoViews(videoId: string): Promise<VideoObject> {
    const video = await this.videosRepository.findOneBy({ id: videoId });

    if (!video) {
      throw new NotFoundException(`Video with id ${videoId} not found`);
    }

    video.views = (video.views || 0) + 1;
    return await this.videosRepository.save(video);
  }

  async getSuggestions(videoId: string): Promise<VideoObject[]> {
    const referenceVideo = await this.videosRepository.findOne({
      where: { id: videoId },
      relations: ['tags', 'creator'],
    });

    if (!referenceVideo) {
      throw new NotFoundException(`Video with id ${videoId} not found`);
    }

    const allOtherVideos = await this.videosRepository.find({
      where: { id: Not(videoId), archived: false },
      relations: ['tags', 'creator'],
    });

    const referenceTagNames = referenceVideo.tags.map((tag) => tag.name);
    const referenceUserId = referenceVideo.creator.id;

    const scoredVideos = allOtherVideos.map((video) => {
      const videoTagNames = video.tags.map((tag) => tag.name);
      const commonTagsCount = videoTagNames.filter((tag) =>
        referenceTagNames.includes(tag),
      ).length;
      const sameUser = video.creator.id === referenceUserId ? 1 : 0;
      const recencyScore = new Date(video.createdAt).getTime(); // Timestamp = plus grand = plus récent

      // Score pondéré : tags (x10), même user (x5), récence normalisée
      const score = commonTagsCount * 10 + sameUser * 5 + recencyScore / 1e13; // légère normalisation
      return { video, score };
    });

    const topVideos = scoredVideos
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.video);

    return topVideos;
  }
}
