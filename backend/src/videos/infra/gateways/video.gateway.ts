import { IVideoGateway } from '../../domain/gateways/videos.gateway';
import { VideoObject } from '../../domain/video';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VideoEntity } from './entities/video.entity';

export class VideoGateway implements IVideoGateway {
  constructor(
    @InjectRepository(VideoEntity)
    private readonly videosRepository: Repository<VideoEntity>,
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

    return await this.videosRepository.remove(video);
  }
}
