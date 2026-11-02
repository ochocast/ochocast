import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  IRecordingVMGateway,
  StartRecordingConfig,
} from '../gateways/recording-vm.gateway';
import {
  RecordingAuthorizationService,
  RecordingPrincipal,
} from '../recording-authorization.service';

@Injectable()
export class StartRecordingUsecase {
  constructor(
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
    private readonly authorization: RecordingAuthorizationService,
  ) {}

  async execute(
    config: StartRecordingConfig,
    principal: RecordingPrincipal,
  ): Promise<void> {
    const { track } = await this.authorization.authorize(
      config.trackId,
      principal,
    );
    // Live rooms are keyed by track.id, exactly as in LiveRoomUsecase. Neither
    // a caller's room key nor a caller-selected room confers recording rights.
    if (config.roomId !== track.id)
      throw new BadRequestException('roomId must match the authorized track');
    return this.recordingVMGateway.startRecording({
      roomId: track.id,
      trackId: track.id,
    });
  }
}
