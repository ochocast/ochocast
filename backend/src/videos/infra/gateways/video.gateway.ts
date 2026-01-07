import { IVideoGateway } from '../../domain/gateways/videos.gateway';
import { VideoObject } from '../../domain/video';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Not, Repository } from 'typeorm';
import { VideoEntity } from './entities/video.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

    // Parse les tags s'ils sont au format JSON
    let tags: TagEntity[] = [];
    if (typeof videoDetails.tags === 'string') {
      tags = JSON.parse(videoDetails.tags).map(
        (tag: any) => new TagEntity(tag),
      );
    } else if (Array.isArray(videoDetails.tags)) {
      tags = videoDetails.tags.map((tag: any) => new TagEntity(tag));
    }

    // Parse les internal_speakers s'ils sont au format JSON
    let internal_speakers: UserEntity[] = [];
    if (typeof videoDetails.internal_speakers === 'string') {
      internal_speakers = JSON.parse(videoDetails.internal_speakers).map(
        (user: any) => new UserEntity(user),
      );
    } else if (Array.isArray(videoDetails.internal_speakers)) {
      internal_speakers = videoDetails.internal_speakers.map(
        (user: any) => new UserEntity(user),
      );
    }
    const video: VideoEntity = new VideoEntity({
      ...videoDetails,
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

    const mediaCommand = new DeleteObjectCommand({
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: video.media_id,
    });
    this.s3Client.send(mediaCommand);

    const miniatureCommand = new DeleteObjectCommand({
      Bucket: process.env.STOCK_MINIATURE_BUCKET,
      Key: video.miniature_id,
    });
    this.s3Client.send(miniatureCommand);

    // Delete subtitle file if it exists
    if (video.subtitle_id) {
      const subtitleCommand = new DeleteObjectCommand({
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: video.subtitle_id,
      });
      this.s3Client.send(subtitleCommand);
    }

    return await this.videosRepository.remove(video);
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
