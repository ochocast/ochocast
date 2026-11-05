import { Injectable } from '@nestjs/common';
import {
  ILiveRoomGateway,
  LiveRoomResponse,
} from 'src/tracks/domain/gateways/live-room.gateway';
import { controlPlaneHeaders, controlPlaneUrl } from 'src/common/control-plane';

@Injectable()
export class LiveRoomGateway implements ILiveRoomGateway {
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
    const response = await fetch(`${controlPlaneUrl()}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...controlPlaneHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
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
