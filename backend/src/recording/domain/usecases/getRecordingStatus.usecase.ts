import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IRecordingVMGateway } from '../gateways/recording-vm.gateway';
import {
  IRecordingErrorGateway,
  RecordingErrorKind,
} from '../gateways/recording-error.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

export type RecordingState =
  | 'disabled'
  | 'armed_waiting'
  | 'recording'
  | 'error';

export interface RecordingStatus {
  state: RecordingState;
  error: {
    kind: RecordingErrorKind | 'recorder_unreachable';
    occurredAt: Date | null;
  } | null;
}

/**
 * US-5c — Real-time recording status of a track, shown next to the toggle and
 * as a banner on the live page. Organizer-only.
 */
@Injectable()
export class GetRecordingStatusUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
    @Inject('RecordingErrorGateway')
    private recordingErrorGateway: IRecordingErrorGateway,
  ) {}

  async execute(trackId: string, email: string): Promise<RecordingStatus> {
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
          'Only the organizer can see the recording status of this track',
        );
      }
    }

    let recording = false;
    let recorderReachable = true;
    try {
      const { status } = await this.recordingVMGateway.getStatus(trackId);
      recording = status === 'recording';
    } catch {
      recorderReachable = false;
    }

    // A running recorder is reported even on a disarmed track (a stop failed).
    if (recording) return { state: 'recording', error: null };
    if (!track.recordingArmed) return { state: 'disabled', error: null };

    const error = await this.recordingErrorGateway.getError(trackId);
    if (error) return { state: 'error', error };
    if (!recorderReachable) {
      return {
        state: 'error',
        error: { kind: 'recorder_unreachable', occurredAt: null },
      };
    }
    return { state: 'armed_waiting', error: null };
  }
}
