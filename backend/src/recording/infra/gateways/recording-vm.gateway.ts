import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac } from 'node:crypto';
import {
  IRecordingVMGateway,
  StartRecordingConfig,
} from '../../domain/gateways/recording-vm.gateway';

/**
 * HMAC-SHA256 of `timestamp \n method \n path?query \n sha256(body)`, keyed
 * with RECORDING_SHARED_SECRET. The recorder runs on the on-demand SFU worker,
 * reached over plain HTTP, so the secret itself is never sent (see
 * liveRecoder/auth.go for the verification).
 */
export function signRecorderRequest(
  secret: string,
  timestamp: string,
  method: string,
  pathAndQuery: string,
  body: string,
): string {
  const bodyHash = createHash('sha256').update(body).digest('hex');
  return createHmac('sha256', secret)
    .update(`${timestamp}\n${method}\n${pathAndQuery}\n${bodyHash}`)
    .digest('hex');
}

// A worker gone with its live (or a blackholed address) must not hang a
// request: starting waits for the recorder to join the SFU, the rest is quick.
const RECORDER_TIMEOUT_MS = 10_000;
const RECORDER_START_TIMEOUT_MS = 30_000;

@Injectable()
export class RecordingVMGateway implements IRecordingVMGateway {
  private readonly logger = new Logger(RecordingVMGateway.name);
  private readonly vmUrl: string;
  private readonly controlPlaneUrl: string;
  private readonly sharedSecret: string;
  // Recorder that records each room: the one on the worker carrying the live.
  private readonly recorderByRoom = new Map<string, string>();

  constructor() {
    // Fallback when the control plane reports no per-worker recorder (local
    // development, or workers started without one).
    this.vmUrl = process.env.RECORDING_VM_URL || 'http://localhost:8080';
    this.controlPlaneUrl =
      process.env.CONTROL_PLANE_URL || 'http://localhost:8090';
    this.sharedSecret = process.env.RECORDING_SHARED_SECRET || '';
    this.logger.log(`Recording VM URL: ${this.vmUrl}`);
    this.logger.log(`Control Plane URL: ${this.controlPlaneUrl}`);
  }

  /** Calls the recorder with a signed request. */
  private recorderFetch(
    baseUrl: string,
    pathAndQuery: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<Response> {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return fetch(`${baseUrl}${pathAndQuery}`, {
      method,
      signal: AbortSignal.timeout(
        pathAndQuery === '/recording/start'
          ? RECORDER_START_TIMEOUT_MS
          : RECORDER_TIMEOUT_MS,
      ),
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        'X-Recording-Timestamp': timestamp,
        'X-Recording-Signature': signRecorderRequest(
          this.sharedSecret,
          timestamp,
          method,
          pathAndQuery,
          payload,
        ),
      },
      ...(body === undefined ? {} : { body: payload }),
    });
  }

  /**
   * The recorder of the worker carrying the room, from the control plane.
   * `null` when no live runs: no room (404), room not ready (503) or ended
   * (409) — with on-demand workers there is then no recorder at all.
   */
  private async discover(roomId: string): Promise<{
    roomKey: string;
    recorderUrl: string;
  } | null> {
    const discoveryUrl = `${this.controlPlaneUrl}/recorder?room_id=${encodeURIComponent(roomId)}`;
    const cpResponse = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(RECORDER_TIMEOUT_MS),
    });
    if ([404, 409, 503].includes(cpResponse.status)) return null;
    if (!cpResponse.ok) {
      const errorText = await cpResponse.text();
      this.logger.error(`Failed to discover SFU: ${errorText}`);
      throw new Error(`Failed to discover SFU: ${errorText}`);
    }
    const cpData = await cpResponse.json();
    return {
      roomKey: cpData.room_key,
      recorderUrl: cpData.recorder_service_url || this.vmUrl,
    };
  }

  /**
   * Calls the recorder of a room: the one remembered when it was started, else
   * the one the control plane reports (after a backend restart). A remembered
   * recorder that cannot be reached belongs to a worker gone with its live: it
   * is forgotten and the control plane asked again, otherwise every later live
   * of the room would keep calling a dead address. `null` when no live runs,
   * so nothing can be recording the room.
   */
  private async roomRecorderFetch(
    roomId: string,
    pathAndQuery: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<Response | null> {
    const remembered = this.recorderByRoom.get(roomId);
    if (remembered) {
      try {
        return await this.recorderFetch(remembered, pathAndQuery, method, body);
      } catch (error) {
        this.recorderByRoom.delete(roomId);
        this.logger.warn(
          `Recorder ${remembered} of room ${roomId} unreachable (${
            error instanceof Error ? error.message : String(error)
          }), asking the control plane again`,
        );
      }
    }
    const target = await this.discover(roomId);
    if (!target) return null;
    return this.recorderFetch(target.recorderUrl, pathAndQuery, method, body);
  }

  async startRecording(config: StartRecordingConfig): Promise<void> {
    this.logger.log(`Starting recording for room: ${config.roomId}`);

    // Step 1: discover the worker carrying the live, and its recorder.
    const target = await this.discover(config.roomId);
    if (!target) {
      throw new Error(`No live is running for room ${config.roomId}`);
    }
    this.logger.log(
      `Recording room ${config.roomId} with recorder ${target.recorderUrl}`,
    );

    // Step 2: start recording on that recorder.
    const response = await this.recorderFetch(
      target.recorderUrl,
      '/recording/start',
      'POST',
      {
        room_id: config.roomId,
        // No SFU URL: the recorder only records the SFU of its configuration.
        room_key: target.roomKey,
        track_id: config.trackId,
      },
    );
    this.recorderByRoom.set(config.roomId, target.recorderUrl);

    // 409 = the recorder already records this room: starting is idempotent.
    if (response.status === 409) {
      this.logger.log(
        `Recording already in progress for room: ${config.roomId}`,
      );
      return;
    }

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

    const response = await this.roomRecorderFetch(
      roomId,
      '/recording/stop',
      'POST',
      { room_id: roomId },
    );
    this.recorderByRoom.delete(roomId);
    if (!response) {
      // The worker is gone with the live: its recorder already stopped.
      this.logger.log(`No live for room ${roomId}: nothing to stop`);
      return;
    }

    // 409 = nothing recording any more (stopped meanwhile): stopping is idempotent.
    if (response.status === 409) {
      this.logger.log(`Recording already stopped for room: ${roomId}`);
      return;
    }

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`Failed to stop recording: ${errorText}`);
      throw new Error(`Failed to stop recording: ${errorText}`);
    }

    this.logger.log(`Recording stopped successfully for room: ${roomId}`);
  }

  async getStatus(roomId?: string): Promise<{
    status: string;
    roomId?: string;
    filePath?: string;
  }> {
    let response: Response;
    if (roomId) {
      response = await this.roomRecorderFetch(
        roomId,
        `/recording/status?room_id=${encodeURIComponent(roomId)}`,
        'GET',
      );
      if (!response) return { status: 'idle', roomId };
    } else {
      response = await this.recorderFetch(
        this.vmUrl,
        '/recording/status',
        'GET',
      );
    }

    if (!response.ok) {
      throw new Error('Failed to get recording status');
    }

    const data = await response.json();
    return {
      status: data.status,
      roomId: data.room_id,
      filePath: data.file_path,
    };
  }

  async isLiveActive(roomId: string): Promise<boolean> {
    const response = await fetch(
      `${this.controlPlaneUrl}/stream-status?room_id=${encodeURIComponent(roomId)}`,
    );
    if (!response.ok) {
      throw new Error(`Failed to get stream status (HTTP ${response.status})`);
    }
    const data = await response.json();
    return data.active === true;
  }
}
