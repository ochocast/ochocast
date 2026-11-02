import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { IVideoEditGateway } from '../gateways/video-edits.gateway';
import { editableDuration, getEditableVideo } from '../videoEditAccess';
import { VideoEditObject } from '../videoEdit';

/** Starts the montage of a video with one segment covering all of it. */
@Injectable()
export class CreateVideoEditUsecase {
  constructor(
    @Inject('VideoEditGateway')
    private videoEditGateway: IVideoEditGateway,
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(videoId: string, email: string): Promise<VideoEditObject> {
    const video = await getEditableVideo(
      { videoGateway: this.videoGateway, userGateway: this.userGateway },
      videoId,
      email,
    );
    const duration = editableDuration(video);
    if (duration === null) {
      throw new ConflictException(
        'The video can be edited once it is processed and its duration known',
      );
    }

    const edit = await this.videoEditGateway.create(videoId, [
      { sourceStart: 0, sourceEnd: duration, textLayers: [] },
    ]);
    if (!edit) {
      throw new ConflictException('This video already has a montage');
    }
    return edit;
  }
}
