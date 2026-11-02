import { Inject, Injectable } from '@nestjs/common';
import { IRecordingVMGateway } from '../gateways/recording-vm.gateway';
import {
  RecordingAuthorizationService,
  RecordingPrincipal,
} from '../recording-authorization.service';

@Injectable()
export class StopRecordingUsecase {
  constructor(
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
    private readonly authorization: RecordingAuthorizationService,
  ) {}

  async execute(trackId: string, principal: RecordingPrincipal): Promise<void> {
    const { track } = await this.authorization.authorize(trackId, principal);
    return this.recordingVMGateway.stopRecording(track.id);
  }
}
