import { Inject, Injectable } from '@nestjs/common';
import {
  IRecordingVMGateway,
  StartRecordingConfig,
} from '../gateways/recording-vm.gateway';

@Injectable()
export class StartRecordingUsecase {
  constructor(
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
  ) {}

  async execute(config: StartRecordingConfig): Promise<void> {
    return this.recordingVMGateway.startRecording(config);
  }
}
