import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

export class DeleteTrackUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateWay: IEventGateway,
  ) {}

  async execute(id: string, email: string): Promise<TrackObject> {
    const user = await this.userGateway.getUserByEmail(email);
    if (!user) throw new NotFoundException(`User (email: ${email}) not found`);
    const tracks = await this.trackGateway.getTracks({ id: id });
    if (tracks.length === 0)
      throw new NotFoundException(`Event (id: ${id}) not found`);
    const track = tracks[0];
    if (!track.canBeEditBy(user)) {
      const event = await this.eventGateWay.getEventById(track.eventId);
      if (!event.canBeEditBy(user)) throw new UnauthorizedException();
    }

    return await this.trackGateway.deleteTrack(id);
  }
}
