import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';

export class GetVideosUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
  ) {}

  /**
   * Each video says whether viewers get a rendered montage (`edited`) and
   * how long what they get lasts (`renderedDuration`).
   */
  async execute(filter: any): Promise<VideoObject[]> {
    const videos = await this.videoGateway.getVideos(filter);
    const rendered = await this.videoGateway.getRenderedDurations(
      videos.map((video) => video.id),
    );
    return videos.map((video) => {
      const edited = rendered.has(video.id);
      return Object.assign(video, {
        edited,
        renderedDuration: edited
          ? (rendered.get(video.id) ?? video.duration ?? null)
          : (video.duration ?? null),
      });
    });
  }
}
