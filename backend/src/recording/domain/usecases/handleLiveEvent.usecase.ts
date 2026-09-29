import { Inject, Injectable, Logger } from '@nestjs/common';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { StartRecordingUsecase } from './startRecording.usecase';
import { StopRecordingUsecase } from './stopRecording.usecase';

export type LiveEventType = 'started' | 'stopped';

/**
 * US-5b — React to a "live started / stopped" notification from the SFU.
 *
 * Started on an armed track → start the recorder. Stopped → stop it (the
 * segment is posted). Each live portion yields one segment, including a host
 * reconnection within the SFU grace period. `room_id == trackId`.
 */
@Injectable()
export class HandleLiveEventUsecase {
  private readonly logger = new Logger(HandleLiveEventUsecase.name);

  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    private startRecordingUsecase: StartRecordingUsecase,
    private stopRecordingUsecase: StopRecordingUsecase,
  ) {}

  // Failures are already recorded for the organizer by the start/stop
  // usecases (US-5c); the SFU only needs an acknowledgement.
  async execute(roomId: string, event: LiveEventType): Promise<void> {
    try {
      await this.handle(roomId, event);
    } catch (err) {
      this.logger.error(
        `Could not handle live ${event} on track ${roomId}: ${err.message}`,
      );
    }
  }

  private async handle(roomId: string, event: LiveEventType): Promise<void> {
    if (event === 'stopped') {
      await this.stopRecordingUsecase.execute(roomId);
      return;
    }

    const tracks = await this.trackGateway.getTracks({ id: roomId });
    if (!tracks || tracks.length === 0) {
      this.logger.warn(`Live started on unknown track ${roomId}, ignored`);
      return;
    }
    if (!tracks[0].recordingArmed) return;

    this.logger.log(`Live started on armed track ${roomId}, recording`);
    await this.startRecordingUsecase.execute(roomId);
  }
}
