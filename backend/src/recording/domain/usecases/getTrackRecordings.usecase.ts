import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { RecordingObject, RecordingVisibility } from '../recording';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

/**
 * US-1 / US-2 — List the recording segments of a track.
 *
 * Unlisted segments are organizer-only: access is restricted to a track speaker
 * or an editor of the parent event. Defaults to `unlisted`, the working set
 * shown in the track settings.
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
    visibility: RecordingVisibility = 'unlisted',
  ): Promise<RecordingObject[]> {
    const tracks = await this.trackGateway.getTracks({ id: trackId });
    if (!tracks || tracks.length === 0) {
      throw new NotFoundException(`Track not found: ${trackId}`);
    }

    const currentUser = await this.userGateway.getUserByEmail(email);
    if (!currentUser) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    const track = tracks[0];
    if (!track.canBeEditBy(currentUser)) {
      const event = await this.eventGateway.getEventById(track.eventId);
      if (!event || !event.canBeEditBy(currentUser)) {
        throw new UnauthorizedException(
          'Only the organizer can access the recordings of this track',
        );
      }
    }

    return this.recordingRepository.getRecordingsByTrack(trackId, {
      visibility,
    });
  }
}
