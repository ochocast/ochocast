import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

/**
 * US-4 — Mark a recording as `published` once the organizer has created a video
 * from it through the regular video editor. Does not create a video itself;
 * it only flips the recording out of the unlisted working set so it can't be
 * published twice. Organizer-only.
 */
@Injectable()
export class MarkRecordingPublishedUsecase {
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

  async execute(recordingId: string, email: string): Promise<void> {
    const recording =
      await this.recordingRepository.getRecordingById(recordingId);
    if (!recording) {
      throw new NotFoundException(`Recording not found: ${recordingId}`);
    }
    if (recording.visibility !== 'unlisted') {
      throw new BadRequestException('Recording is already published');
    }
    if (recording.status !== 'ready') {
      throw new BadRequestException('Recording is not ready');
    }

    const tracks = await this.trackGateway.getTracks({
      id: recording.trackId,
    });
    if (!tracks || tracks.length === 0) {
      throw new NotFoundException(`Track not found: ${recording.trackId}`);
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
          'Only the organizer can publish this recording',
        );
      }
    }

    await this.recordingRepository.updateRecording(recordingId, {
      visibility: 'published',
    });
  }
}
