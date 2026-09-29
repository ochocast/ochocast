import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IRecordingVMGateway } from '../gateways/recording-vm.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { StartRecordingUsecase } from './startRecording.usecase';
import { StopRecordingUsecase } from './stopRecording.usecase';

/**
 * US-5a — Arm / disarm the recording of a track. Organizer-only.
 *
 * The flag persists across lives. Arming during a live starts the recorder
 * immediately; disarming stops it immediately (the segment is kept).
 */
@Injectable()
export class SetRecordingArmedUsecase {
  private readonly logger = new Logger(SetRecordingArmedUsecase.name);

  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
    private startRecordingUsecase: StartRecordingUsecase,
    private stopRecordingUsecase: StopRecordingUsecase,
  ) {}

  async execute(
    trackId: string,
    armed: boolean,
    email: string,
  ): Promise<{ recordingArmed: boolean }> {
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
          'Only the organizer can arm the recording of this track',
        );
      }
    }

    track.recordingArmed = armed;
    const updated = await this.trackGateway.updateTrack(track);

    await this.applyToCurrentLive(trackId, armed);

    return { recordingArmed: updated.recordingArmed };
  }

  // The flag is saved even if the recorder cannot be reached right now.
  private async applyToCurrentLive(
    trackId: string,
    armed: boolean,
  ): Promise<void> {
    try {
      if (!armed) {
        await this.stopRecordingUsecase.execute(trackId);
      } else if (await this.recordingVMGateway.isLiveActive(trackId)) {
        await this.startRecordingUsecase.execute(trackId);
      }
    } catch (err) {
      this.logger.error(
        `Could not ${armed ? 'start' : 'stop'} recording for track ${trackId}: ${err.message}`,
      );
    }
  }
}
