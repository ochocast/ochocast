import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { IVideoEditGateway } from '../gateways/video-edits.gateway';
import { getEditableVideo } from '../videoEditAccess';
import { RenderStatusObject, VideoEditObject } from '../videoEdit';

/** Reads the montage of a video, or only its render status. */
@Injectable()
export class GetVideoEditUsecase {
  constructor(
    @Inject('VideoEditGateway')
    private videoEditGateway: IVideoEditGateway,
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(videoId: string, email: string): Promise<VideoEditObject> {
    await getEditableVideo(
      { videoGateway: this.videoGateway, userGateway: this.userGateway },
      videoId,
      email,
    );
    const edit = await this.videoEditGateway.findByVideoId(videoId);
    if (!edit) {
      throw new NotFoundException(`Video (id: ${videoId}) has no montage`);
    }
    return edit;
  }

  async renderStatus(
    videoId: string,
    email: string,
  ): Promise<RenderStatusObject> {
    const edit = await this.execute(videoId, email);
    return {
      videoId: edit.videoId,
      renderStatus: edit.renderStatus,
      renderError: edit.renderError,
      version: edit.version,
      updatedAt: edit.updatedAt,
    };
  }
}
