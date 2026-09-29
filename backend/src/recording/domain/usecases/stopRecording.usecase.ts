import { Inject, Injectable } from '@nestjs/common';
import { IRecordingVMGateway } from '../gateways/recording-vm.gateway';

/**
 * Stop the recorder of a track; the recorder then posts the segment (US-1).
 * No-op when nothing is recording on the track.
 */
@Injectable()
export class StopRecordingUsecase {
  constructor(
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
  ) {}

  async execute(trackId: string): Promise<void> {
    const { status } = await this.recordingVMGateway.getStatus(trackId);
    if (status !== 'recording') return;
    return this.recordingVMGateway.stopRecording(trackId);
  }
}
