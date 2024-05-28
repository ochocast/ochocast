import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';

export class UpdateVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
  ) {}

  async execute(video: VideoObject): Promise<VideoObject> {
    return await this.videoGateway.updateVideo(video);
  }
}
