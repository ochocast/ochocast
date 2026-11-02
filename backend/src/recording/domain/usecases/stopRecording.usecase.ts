import { Inject, Injectable } from '@nestjs/common';
import { IRecordingVMGateway } from '../gateways/recording-vm.gateway';
import { IRecordingErrorGateway } from '../gateways/recording-error.gateway';

/**
 * Stop the recorder of a track; the recorder then posts the segment (US-1).
 * No-op when nothing is recording on the track. A failure is recorded for
 * the organizer (US-5c).
 */
@Injectable()
export class StopRecordingUsecase {
  constructor(
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
    @Inject('RecordingErrorGateway')
    private recordingErrorGateway: IRecordingErrorGateway,
  ) {}

  async execute(trackId: string): Promise<void> {
    const { status } = await this.recordingVMGateway.getStatus(trackId);
    if (status !== 'recording') return;

    try {
      await this.recordingVMGateway.stopRecording(trackId);
    } catch (err) {
      await this.recordingErrorGateway.setError(trackId, 'stop_failed');
      throw err;
    }
    await this.recordingErrorGateway.clearError(trackId);
  }
}
