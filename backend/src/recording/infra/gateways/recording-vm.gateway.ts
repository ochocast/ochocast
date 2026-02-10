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
    this.logger.log(`Recording VM URL: ${this.vmUrl}`);
    this.logger.log(`Control Plane URL: ${this.controlPlaneUrl}`);
  }

  async startRecording(config: StartRecordingConfig): Promise<void> {
    this.logger.log(`Starting recording for room: ${config.roomId}`);

    // Step 1: Discover ingestion SFU from Control Plane (same pattern as frontend /viewer)
    const discoveryUrl = `${this.controlPlaneUrl}/recorder?room_id=${config.roomId}`;
    this.logger.log(`Discovering SFU from control plane: ${discoveryUrl}`);

    const cpResponse = await fetch(discoveryUrl);

    if (!cpResponse.ok) {
      const errorText = await cpResponse.text();
      this.logger.error(`Failed to discover SFU: ${errorText}`);
      throw new Error(`Failed to discover SFU: ${errorText}`);
    }

    const cpData = await cpResponse.json();
    this.logger.log(`SFU discovery response: ${JSON.stringify(cpData)}`);

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
      this.logger.error(`Failed to start recording: ${errorText}`);
      throw new Error(`Failed to start recording: ${errorText}`);
    }

    this.logger.log(
      `Recording started successfully for room: ${config.roomId}`,
    );
  }

  async stopRecording(roomId: string): Promise<void> {
    this.logger.log(`Stopping recording for room: ${roomId}`);

    const response = await fetch(`${this.vmUrl}/recording/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Failed to stop recording: ${errorText}`);
      throw new Error(`Failed to stop recording: ${errorText}`);
    }

    this.logger.log(`Recording stopped successfully for room: ${roomId}`);
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
