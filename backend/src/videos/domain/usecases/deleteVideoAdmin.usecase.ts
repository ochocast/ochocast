import { Inject, Injectable } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';

@Injectable()
export class DeleteVideoAdminUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
  ) {}

  async execute(id: string): Promise<VideoObject> {
    return await this.videoGateway.deleteVideoAdmin(id);
  }
}
