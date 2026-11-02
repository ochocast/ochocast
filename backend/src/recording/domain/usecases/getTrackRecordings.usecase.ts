import { Inject, Injectable } from '@nestjs/common';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { RecordingObject, RecordingVisibility } from '../recording';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { getOrganizedTrack } from '../trackOrganizer';

/**
 * US-1 / US-2 — List the recording segments of a track.
 *
 * Unlisted segments are organizer-only: access is restricted to a track speaker
 * or an editor of the parent event. Without a visibility filter, published
 * recordings are included too: the track settings show them as a compact
 * "published on X's channel" line.
 */
@Injectable()
export class GetTrackRecordingsUsecase {
  constructor(
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(
    trackId: string,
    email: string,
    visibility?: RecordingVisibility,
  ): Promise<RecordingObject[]> {
    await getOrganizedTrack(
      {
        trackGateway: this.trackGateway,
        userGateway: this.userGateway,
        eventGateway: this.eventGateway,
      },
      trackId,
      email,
      'Only the organizer can access the recordings of this track',
    );

    return this.recordingRepository.getRecordingsByTrack(
      trackId,
      visibility ? { visibility } : undefined,
    );
  }
}
