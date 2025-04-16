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
    video.createdAt = new Date(JSON.parse(video.createdAt.toString()));
    video.comments = JSON.parse(video.comments.toString());
    video.tags = JSON.parse(video.tags.toString());
    video.internal_speakers = JSON.parse(video.internal_speakers.toString());
    return await this.videoGateway.modifyVideo(video);
  }
}
