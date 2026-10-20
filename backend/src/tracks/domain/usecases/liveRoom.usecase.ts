import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import {
  ILiveRoomGateway,
  LiveRoomResponse,
} from '../gateways/live-room.gateway';

// The live room of a track holds its stream key: only the track's speakers and the
// event's creator may open it or read it (the same rule as closing the track).
export class LiveRoomUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('LiveRoomGateway')
    private liveRoomGateway: ILiveRoomGateway,
  ) {}

  async open(trackId: string, email: string): Promise<LiveRoomResponse> {
    await this.checkCanStream(trackId, email);
    return this.liveRoomGateway.create(trackId);
  }

  async get(trackId: string, email: string): Promise<LiveRoomResponse> {
    await this.checkCanStream(trackId, email);
    return this.liveRoomGateway.get(trackId);
  }

  async status(trackId: string, email: string): Promise<LiveRoomResponse> {
    await this.checkCanStream(trackId, email);
    return this.liveRoomGateway.status(trackId);
  }

  private async checkCanStream(trackId: string, email: string) {
    const tracks = await this.trackGateway.getTracks({ id: trackId });
    if (tracks.length === 0)
      throw new NotFoundException(`Track ${trackId} not found`);

    const currentUser = email
      ? await this.userGateway.getUserByEmail(email)
      : null;
    if (!currentUser)
      throw new UnauthorizedException('Sign in to stream on this track');

    const track = tracks[0];
    if (track.canBeEditBy(currentUser)) return;
    const event = await this.eventGateway.getEventById(track.eventId);
    if (!event?.canBeEditBy(currentUser))
      throw new UnauthorizedException(
        `User (email : ${email}) cannot stream on track (id : ${trackId})`,
      );
  }
}
