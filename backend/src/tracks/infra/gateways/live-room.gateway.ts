import { Injectable, Logger } from '@nestjs/common';
import {
  ILiveRoomGateway,
  LiveRoomResponse,
} from 'src/tracks/domain/gateways/live-room.gateway';
import { controlPlaneHeaders, controlPlaneUrl } from 'src/common/control-plane';
import { LiveRoomUnavailableError } from 'src/tracks/domain/errors';

// Creating a room returns at once, with state "provisioning" while a worker starts: the
// browser then polls the status. A control plane that takes longer is stuck.
const CONTROL_PLANE_TIMEOUT_MS = 15_000;

@Injectable()
export class LiveRoomGateway implements ILiveRoomGateway {
  private readonly logger = new Logger(LiveRoomGateway.name);

  create(roomId: string): Promise<LiveRoomResponse> {
    return this.call('POST', '/room/create', { room_id: roomId });
  }

  get(roomId: string): Promise<LiveRoomResponse> {
    return this.call(
      'GET',
      `/room/exists?room_id=${encodeURIComponent(roomId)}`,
    );
  }

  status(roomId: string): Promise<LiveRoomResponse> {
    return this.call(
      'GET',
      `/room/status?room_id=${encodeURIComponent(roomId)}`,
    );
  }

  private async call(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<LiveRoomResponse> {
    let response: Response;
    try {
      response = await fetch(`${controlPlaneUrl()}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...controlPlaneHeaders(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(CONTROL_PLANE_TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      this.logger.error(
        `Control plane ${method} ${path}: ${timedOut ? 'timed out' : error}`,
      );
      throw new LiveRoomUnavailableError(
        'Live streaming is unavailable',
        timedOut,
      );
    }
    // Its credentials or its own failures are not the browser's business: a wrong
    // SFU_CONTROL_TOKEN must not look like the user's session expiring.
    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status >= 500
    ) {
      this.logger.error(
        `Control plane ${method} ${path} answered ${response.status}: ${(await response.text()).slice(0, 200)}`,
      );
      throw new LiveRoomUnavailableError('Live streaming is unavailable');
    }
    const text = await response.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { message: text.trim() };
    }
    return { status: response.status, body: parsed };
  }
}
