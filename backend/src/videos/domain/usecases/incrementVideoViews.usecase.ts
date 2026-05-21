import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';

export class IncrementVideoViewsUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
  ) {}

  async execute(videoId: string): Promise<VideoObject> {
    return await this.videoGateway.incrementVideoViews(videoId);
  }
}
