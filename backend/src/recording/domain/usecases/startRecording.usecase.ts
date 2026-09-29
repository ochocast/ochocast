import { Inject, Injectable, Logger } from '@nestjs/common';
import { IRecordingVMGateway } from '../gateways/recording-vm.gateway';

// Delays between start attempts: the SFU may answer "stream not ready" for a
// few seconds after the live started, and the recorder VM may be restarting.
const RETRY_DELAYS_MS = [2000, 5000];

/**
 * US-5 — Start the recorder on a track's live, server-side.
 *
 * Idempotent: never starts a second recorder when one is already running on
 * the track (webhook received twice, re-arming during a live...). Retries a
 * few times before giving up. `room_id == trackId`.
 */
@Injectable()
export class StartRecordingUsecase {
  private readonly logger = new Logger(StartRecordingUsecase.name);

  constructor(
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
  ) {}

  async execute(trackId: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        const { status } = await this.recordingVMGateway.getStatus(trackId);
        if (status === 'recording') return;

        await this.recordingVMGateway.startRecording({
          roomId: trackId,
          trackId,
        });
        return;
      } catch (err) {
        if (attempt >= RETRY_DELAYS_MS.length) throw err;
        this.logger.warn(
          `Start recording attempt ${attempt + 1} failed for track ${trackId}: ${err.message}`,
        );
        await this.wait(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
