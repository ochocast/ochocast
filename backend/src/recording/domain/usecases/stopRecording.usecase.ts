import { Inject, Injectable } from '@nestjs/common';
import { IRecordingVMGateway } from '../gateways/recording-vm.gateway';

@Injectable()
export class StopRecordingUsecase {
  constructor(
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
  ) {}

  async execute(roomId: string): Promise<void> {
    return this.recordingVMGateway.stopRecording(roomId);
  }
}
