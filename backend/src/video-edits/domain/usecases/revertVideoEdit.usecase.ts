import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { IVideoEditGateway } from '../gateways/video-edits.gateway';
import { editableDuration, getEditableVideo } from '../videoEditAccess';
import { VideoEditObject } from '../videoEdit';
import { assertReplaced } from './saveVideoEdit.usecase';

/**
 * "Revenir à l'original": viewers get the original video back at once (no
 * render), and the montage restarts from it: one segment covering the whole
 * video, no text. The original file is never touched.
 */
@Injectable()
export class RevertVideoEditUsecase {
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
      throw new ConflictException('The video duration is unknown');
    }

    return assertReplaced(
      await this.videoEditGateway.replaceContent(
        videoId,
        [{ sourceStart: 0, sourceEnd: duration, textLayers: [] }],
        { renderStatus: 'draft', clearRenderedMedia: true },
      ),
      videoId,
    );
  }
}
