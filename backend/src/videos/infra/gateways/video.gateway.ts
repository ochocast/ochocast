import { IVideoGateway } from '../../domain/gateways/videos.gateway';
import { VideoObject } from '../../domain/video';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoEntity } from './entities/video.entity';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Inject } from '@nestjs/common';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class VideoGateway implements IVideoGateway {
  constructor(
    @InjectRepository(VideoEntity)
    private readonly videosRepository: Repository<VideoEntity>, @Inject('s3Client' ) private s3Client: S3Client
  ) {}

  async createNewVideo(videoDetails: VideoObject): Promise<VideoObject> {
    console.log(videoDetails);

    // Parse les tags s'ils sont au format JSON
    let tags: TagEntity[] = [];
    if (typeof videoDetails.tags === 'string') {
      tags = JSON.parse(videoDetails.tags).map((tag: any) => new TagEntity(tag));
    } else if (Array.isArray(videoDetails.tags)) {
      tags = videoDetails.tags.map((tag: any) => new TagEntity(tag));
    }
    
    // Parse les internal_speakers s'ils sont au format JSON
    let internal_speakers: UserEntity[] = [];
    if (typeof videoDetails.internal_speakers === 'string') {
      internal_speakers = JSON.parse(videoDetails.internal_speakers).map((user: any) => new UserEntity(user));
    } else if (Array.isArray(videoDetails.internal_speakers)) {
      internal_speakers = videoDetails.internal_speakers.map((user: any) => new UserEntity(user));
    }
    const video: VideoEntity = new VideoEntity({
      ...videoDetails,
      tags,
      internal_speakers
    });

    return await this.videosRepository.save(video);
  }

  getVideos(filter: any): Promise<VideoObject[]> {
    console.log(filter);
    return this.videosRepository.find({
      where: {
        ...filter,
        archived: false
      },
      relations: ['creator', 'tags', 'internal_speakers'],
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

  async deleteVideoAdmin(videoId: string): Promise<VideoObject> {
    const video = await this.videosRepository.findOneBy({ id: videoId });

    console.log("video to delete found !")
    console.log(video);
    
    const mediaCommand = new DeleteObjectCommand({
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: video.media_id
    });
    this.s3Client.send(mediaCommand);

    const miniatureCommand = new DeleteObjectCommand({
      Bucket: process.env.STOCK_MINIATURE_BUCKET,
      Key: video.miniature_id
    });
    this.s3Client.send(miniatureCommand);

    return await this.videosRepository.remove(video);
  }

  async modifyVideo(video: VideoObject): Promise<VideoObject> {
    const existingVideo = await this.videosRepository.findOneBy({ id: video.id });
    if (!existingVideo) {
      throw new Error(`Video with ID ${video.id} not found`);
    }

    Object.assign(existingVideo, video);
    return await this.videosRepository.save(existingVideo);
  }
}
