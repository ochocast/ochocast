import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';

export class GetVideosUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
  ) {}

  async execute(filter: any): Promise<VideoObject[]> {
    return await this.videoGateway.getVideos(filter);
  }
}
