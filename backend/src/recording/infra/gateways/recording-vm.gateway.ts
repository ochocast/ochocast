import { Injectable, Logger } from '@nestjs/common';
import {
  IRecordingVMGateway,
  StartRecordingConfig,
} from '../../domain/gateways/recording-vm.gateway';

@Injectable()
export class RecordingVMGateway implements IRecordingVMGateway {
  private readonly logger = new Logger(RecordingVMGateway.name);
  private readonly vmUrl: string;
  private readonly controlPlaneUrl: string;

  constructor() {
    this.vmUrl = process.env.RECORDING_VM_URL || 'http://localhost:8080';
    this.controlPlaneUrl =
      process.env.CONTROL_PLANE_URL || 'http://localhost:8090';
    this.logger.log(
      {
        'recording.vm_url': this.vmUrl,
        'sfu.control_plane_url': this.controlPlaneUrl,
      },
      'recording gateway configured',
    );
  }

  async startRecording(config: StartRecordingConfig): Promise<void> {
    // Step 1: Discover ingestion SFU from Control Plane (same pattern as frontend /viewer)
    const discoveryUrl = `${this.controlPlaneUrl}/recorder?room_id=${config.roomId}`;

    const cpResponse = await fetch(discoveryUrl);

    if (!cpResponse.ok) {
      const errorText = await cpResponse.text();
      throw new Error(`Failed to discover SFU: ${errorText}`);
    }

    const cpData = await cpResponse.json();
    // The response carries the room key: log the SFU only.
    this.logger.log(
      {
        'recording.room_id': config.roomId,
        'recording.sfu_url': cpData.sfu_url,
      },
      'ingestion SFU discovered',
    );

    // Step 2: Start recording with the discovered SFU URL and key
    const response = await fetch(`${this.vmUrl}/recording/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room_id: config.roomId,
        room_key: cpData.room_key,
        sfu_url: cpData.sfu_url,
        track_id: config.trackId || config.roomId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to start recording: ${errorText}`);
    }
  }

  async stopRecording(roomId: string): Promise<void> {
    const response = await fetch(`${this.vmUrl}/recording/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to stop recording: ${errorText}`);
    }
  }

  async getStatus(): Promise<{
    status: string;
    roomId?: string;
    filePath?: string;
  }> {
    const response = await fetch(`${this.vmUrl}/recording/status`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to get recording status');
    }

    return response.json();
  }
}
