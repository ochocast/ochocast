import { Inject, Injectable, Logger } from '@nestjs/common';
import { IRecordingVMGateway } from '../gateways/recording-vm.gateway';
import { withSpan } from 'src/common/telemetry';

@Injectable()
export class StopRecordingUsecase {
  private readonly logger = new Logger(StopRecordingUsecase.name);

  constructor(
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
  ) {}

  async execute(roomId: string): Promise<void> {
    const attributes = { 'recording.room_id': roomId };
    try {
      await withSpan('recording.stop', attributes, () =>
        this.recordingVMGateway.stopRecording(roomId),
      );
      this.logger.log(
        { event: 'recording.stopped', ...attributes },
        'recording stopped',
      );
    } catch (error) {
      this.logger.error(
        { event: 'recording.failed', ...attributes, err: error },
        'recording stop failed',
      );
      throw error;
    }
  }
}
