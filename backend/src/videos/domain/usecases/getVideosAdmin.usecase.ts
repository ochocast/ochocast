import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';

export class GetVideosAdminUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
  ) {}

  async execute(filter: any): Promise<VideoObject[]> {
    return await this.videoGateway.getVideosAdmin(filter);
  }
}
