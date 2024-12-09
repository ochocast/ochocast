import { IVideoGateway } from '../../domain/gateways/videos.gateway';
import { VideoObject } from '../../domain/video';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoEntity } from './entities/video.entity';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Inject } from '@nestjs/common';

export class VideoGateway implements IVideoGateway {
  constructor(
    @InjectRepository(VideoEntity)
    private readonly videosRepository: Repository<VideoEntity>, @Inject('s3Client' ) private s3Client: S3Client
  ) {}

  async createNewVideo(videoDetails: VideoObject): Promise<VideoObject> {
    const video: VideoEntity = new VideoEntity({
      ...videoDetails,
    });

    return await this.videosRepository.save(video);
  }

  getVideos(filter: any): Promise<VideoObject[]> {
    return this.videosRepository.find({
      where: {
        ...filter,
        archived: false
      },
      relations: ['creator'],
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
    // TODO: si la suppression en BDD s'est bien passé, supprimer dans le bucket

    return await this.videosRepository.remove(video);
  }
}
