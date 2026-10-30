import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import { IVideoUploadGateway } from '../gateways/video-upload.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { getOrganizedTrack } from '../trackOrganizer';
import {
  assertNoPendingRequest,
  assertPublishable,
  recordingFilename,
} from '../recordingPublication';

/**
 * US-4 — The organizer publishes a recording on their own channel: the
 * recording is copied server side into a new video upload of theirs, which the
 * editor then completes with the video metadata.
 */
@Injectable()
export class PrepareRecordingUploadUsecase {
  constructor(
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('PublicationRequestGateway')
    private requestGateway: IPublicationRequestGateway,
    @Inject('VideoUploadGateway')
    private videoUploadGateway: IVideoUploadGateway,
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(recordingId: string, email: string): Promise<{ id: string }> {
    const recording =
      await this.recordingRepository.getRecordingById(recordingId);
    if (!recording) {
      throw new NotFoundException(`Recording not found: ${recordingId}`);
    }
    await getOrganizedTrack(
      {
        trackGateway: this.trackGateway,
        userGateway: this.userGateway,
        eventGateway: this.eventGateway,
      },
      recording.trackId,
      email,
      'Only the organizer can publish this recording',
    );
    assertPublishable(recording);
    await assertNoPendingRequest(this.requestGateway, recording.id);

    const upload = await this.videoUploadGateway.createFromStoredMedia(email, {
      key: recording.mediaId,
      filename: recordingFilename(recording),
    });
    return { id: upload.id };
  }
}
