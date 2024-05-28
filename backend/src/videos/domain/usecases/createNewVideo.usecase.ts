import { CreateVideoDto } from '../../infra/controllers/dto/create-video.dto';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';

export class CreateNewVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
  ) {}

  async execute(videoToCreate: CreateVideoDto): Promise<VideoObject> {
    const video = new VideoObject(
      uuid(),
      videoToCreate.media_id,
      videoToCreate.title,
      videoToCreate.description,
      videoToCreate.tags,
      videoToCreate.creator,
      new Date(),
      new Date(),
      videoToCreate.internal_speakers,
      videoToCreate.external_speakers,
      0,
      videoToCreate.comments,
    );

    await this.videoGateway.createNewVideo(video);
    return video;
  }
}