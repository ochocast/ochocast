// The SFU control plane, seen from the tracks domain: one room per track.
export interface LiveRoomResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface ILiveRoomGateway {
  // Creates the room (or returns the existing one) with its key and WHIP URL.
  create(roomId: string): Promise<LiveRoomResponse>;
  // Whether the room exists and, once it is ready, its WHIP URL.
  get(roomId: string): Promise<LiveRoomResponse>;
  // Provisioning state while a worker starts.
  status(roomId: string): Promise<LiveRoomResponse>;
}
