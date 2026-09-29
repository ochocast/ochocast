import { IVideoGateway } from '../../domain/gateways/videos.gateway';
import { VideoObject } from '../../domain/video';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Not, Repository } from 'typeorm';
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

    const entityManager = this.videosRepository.manager;
    const tagsRepository = entityManager.getRepository(TagEntity);
    const usersRepository = entityManager.getRepository(UserEntity);

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

    const parsedTags =
      typeof videoDetails.tags === 'string'
        ? JSON.parse(videoDetails.tags)
        : Array.isArray(videoDetails.tags)
          ? videoDetails.tags
          : [];

    const uniqueTags = new Map<string, TagEntity>();

    for (const rawTag of parsedTags) {
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

    const tags = Array.from(uniqueTags.values());

    const parsedInternalSpeakers =
      typeof videoDetails.internal_speakers === 'string'
        ? JSON.parse(videoDetails.internal_speakers)
        : Array.isArray(videoDetails.internal_speakers)
          ? videoDetails.internal_speakers
          : [];

    const uniqueInternalSpeakers = new Map<string, UserEntity>();

    for (const rawUser of parsedInternalSpeakers) {
      const userId = rawUser?.id;
      if (!userId) continue;

      const resolvedUser = await usersRepository.findOneBy({ id: userId });
      if (resolvedUser) {
        uniqueInternalSpeakers.set(resolvedUser.id, resolvedUser);
      }
    }

    const internal_speakers = Array.from(uniqueInternalSpeakers.values());

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

  async modifyVideo(video: VideoObject): Promise<VideoObject> {
    const existingVideo = await this.videosRepository.findOneBy({
      id: video.id,
    });
    if (!existingVideo) {
      throw new Error(`Video with ID ${video.id} not found`);
    }

    Object.assign(existingVideo, video);
    return await this.videosRepository.save(existingVideo);
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
      const recencyScore = new Date(video.createdAt).getTime();

      const score = commonTagsCount * 10 + sameUser * 5 + recencyScore / 1e13;
      return { video, score };
    });

    const topVideos = scoredVideos
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.video);

    return topVideos;
  }

  async getVideosWithoutSubtitle(): Promise<VideoObject[]> {
    return this.videosRepository.find({
      where: { subtitle_id: IsNull(), archived: false },
      order: { createdAt: 'ASC' },
      relations: ['tags', 'creator', 'comments', 'internal_speakers'],
    });
  }

  async updateSubtitleId(videoId: string, subtitleId: string): Promise<void> {
    await this.videosRepository.update(videoId, { subtitle_id: subtitleId });
  }
}
