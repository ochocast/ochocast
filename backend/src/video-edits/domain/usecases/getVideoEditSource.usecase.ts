import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { GetMediaUsecase } from 'src/videos/domain/usecases/getMedia.usecase';
import { getEditableVideo } from '../videoEditAccess';

@Injectable()
export class GetVideoEditSourceUsecase {
  constructor(
    @Inject('VideoGateway') private videoGateway: IVideoGateway,
    @Inject('UserGateway') private userGateway: IUserGateway,
    private getMediaUsecase: GetMediaUsecase,
  ) {}

  async execute(
    videoId: string,
    email: string,
    apiBaseUrl: string,
  ): Promise<string> {
    const video = await getEditableVideo(
      { videoGateway: this.videoGateway, userGateway: this.userGateway },
      videoId,
      email,
    );
    if (video.transcoding_status !== 'ready') {
      throw new ConflictException('Video is not ready');
    }
    return this.getMediaUsecase.execute(videoId, apiBaseUrl, {
      original: true,
    });
  }
}
