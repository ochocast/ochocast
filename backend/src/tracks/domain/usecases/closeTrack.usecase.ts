import {
  Inject,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { IRecordingVMGateway } from 'src/recording/domain/gateways/recording-vm.gateway';
import { StopRecordingUsecase } from 'src/recording/domain/usecases/stopRecording.usecase';

export class CloseTrackUsecase {
  private readonly logger = new Logger(CloseTrackUsecase.name);

  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateWay: IEventGateway,
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
    private stopRecordingUsecase: StopRecordingUsecase,
  ) {}

  async execute(id: string, email: string): Promise<TrackObject> {
    const tracks = await this.trackGateway.getTracks({ id: id });
    if (tracks.length === 0)
      throw new NotFoundException(`Track ${id} not found`);

    const currentUser = await this.userGateway.getUserByEmail(email);
    if (!currentUser)
      throw new NotFoundException(`User with email : ${email} not found`);

    const track = tracks[0];
    if (!track.canBeEditBy(currentUser)) {
      const event = await this.eventGateWay.getEventById(track.eventId);
      if (!event.canBeEditBy(currentUser))
        throw new UnauthorizedException(
          `User (email : ${email}) does not have right to close track (id : ${id})`,
        );
    }

    await this.stopActiveRecording(id);

    track.closed = true;
    return await this.trackGateway.updateTrack(track);
  }

  // Recording VM may be offline or never started a session for this track;
  // closing the track must not fail because of that.
  private async stopActiveRecording(trackId: string): Promise<void> {
    try {
      const status = await this.recordingVMGateway.getStatus(trackId);
      if (status.status === 'recording') {
        this.logger.log(
          `Stopping active recording for closed track ${trackId}`,
        );
        await this.stopRecordingUsecase.execute(trackId);
      }
    } catch (err) {
      this.logger.warn(
        `Could not check/stop recording for track ${trackId}: ${err.message}`,
      );
    }
  }
}
