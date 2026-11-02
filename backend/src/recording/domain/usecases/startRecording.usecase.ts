import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  IRecordingVMGateway,
  StartRecordingConfig,
} from '../gateways/recording-vm.gateway';
import { withSpan } from 'src/common/telemetry';

@Injectable()
export class StartRecordingUsecase {
  private readonly logger = new Logger(StartRecordingUsecase.name);

  constructor(
    @Inject('RecordingVMGateway')
    private recordingVMGateway: IRecordingVMGateway,
  ) {}

  async execute(config: StartRecordingConfig): Promise<void> {
    const attributes = {
      'recording.room_id': config.roomId,
      'recording.track_id': config.trackId || config.roomId,
    };
    try {
      await withSpan('recording.start', attributes, () =>
        this.recordingVMGateway.startRecording(config),
      );
      this.logger.log(
        { event: 'recording.started', ...attributes },
        'recording started',
      );
    } catch (error) {
      this.logger.error(
        { event: 'recording.failed', ...attributes, err: error },
        'recording start failed',
      );
      throw error;
    }
  }
}
