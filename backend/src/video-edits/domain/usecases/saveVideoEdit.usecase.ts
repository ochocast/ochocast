import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import {
  IVideoEditGateway,
  ReplaceContentResult,
} from '../gateways/video-edits.gateway';
import { IVideoEditRenderDispatcher } from '../gateways/render-dispatcher.gateway';
import { editableDuration, getEditableVideo } from '../videoEditAccess';
import { validateEditContent } from '../videoEditRules';
import { SegmentInput, VideoEditObject } from '../videoEdit';

/** Maps a refused write of the montage to its HTTP error. */
export function assertReplaced(
  result: ReplaceContentResult,
  videoId: string,
): VideoEditObject {
  switch (result.status) {
    case 'ok':
      return result.edit;
    case 'not_found':
      throw new NotFoundException(`Video (id: ${videoId}) has no montage`);
    case 'render_in_progress':
      throw new ConflictException(
        `A render is in progress (${result.renderStatus}): the montage cannot change`,
      );
    case 'version_conflict':
      throw new ConflictException(
        `The montage changed meanwhile (current version ${result.currentVersion}): reload it`,
      );
  }
}

/**
 * "Modifier la vidéo": replaces the whole montage (segments and their text
 * layers) in one transaction, then asks for its render. The source video is
 * untouched; the montage stays `pending` until the worker reports back.
 */
@Injectable()
export class SaveVideoEditUsecase {
  private readonly logger = new Logger(SaveVideoEditUsecase.name);

  constructor(
    @Inject('VideoEditGateway')
    private videoEditGateway: IVideoEditGateway,
    @Inject('VideoEditRenderDispatcher')
    private renderDispatcher: IVideoEditRenderDispatcher,
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(
    videoId: string,
    version: number,
    segments: SegmentInput[],
    email: string,
  ): Promise<VideoEditObject> {
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

    const errors = validateEditContent(segments, duration);
    if (errors.length > 0) throw new BadRequestException(errors);

    // Checked before writing: the montage must not wait for a render that
    // nothing will run.
    if (!this.renderDispatcher.enabled) {
      throw new ServiceUnavailableException(
        'Video rendering is not available on this environment',
      );
    }

    const edit = assertReplaced(
      await this.videoEditGateway.replaceContent(videoId, segments, {
        expectedVersion: version,
        renderStatus: 'pending',
      }),
      videoId,
    );

    try {
      await this.renderDispatcher.dispatch({
        jobId: randomUUID(),
        editId: edit.id,
        videoId,
        version: edit.version,
        timestamp: Date.now(),
      });
    } catch (error) {
      // Saved but not queued: failed lets the user edit and save again.
      const message = 'The render could not be started';
      this.logger.error(`${message} for montage ${edit.id}: ${error}`);
      await this.videoEditGateway.markRenderFailed(
        edit.id,
        edit.version,
        message,
      );
      throw new ServiceUnavailableException(message);
    }

    return edit;
  }
}
