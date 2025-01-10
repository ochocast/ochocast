
import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { ModifyVideoDto } from 'src/videos/infra/controllers/dto/modify-video.dto';
export class ModifyVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
  ) {}

  async execute(video: ModifyVideoDto): Promise<VideoObject> {
    video.updatedAt = new Date();
    return await this.videoGateway.modifyVideo(video);
  }
}
