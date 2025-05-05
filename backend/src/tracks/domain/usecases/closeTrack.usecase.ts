import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

export class CloseTrackUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateWay: IEventGateway,
  ) {}

  async execute(id: string, email: string): Promise<TrackObject> {
    const tracks = await this.trackGateway.getTracks({ id: id });
    if (tracks.length === 0)
      throw new NotFoundException(`Track ${id} not found`);

    const currentUser = await this.userGateway.getUserByEmail(email);
    if (!currentUser)
      throw new NotFoundException(`User with email : ${email} not found`);

    const track = tracks[0];
    if (!track.canBeEditBy(currentUser)) {
      const event = await this.eventGateWay.getEventById(track.eventId);
      if (!event.canBeEditBy(currentUser))
        throw new UnauthorizedException(
          `User (email : ${email}) does not have right to close track (id : ${id})`,
        );
    }
    track.closed = true;
    return await this.trackGateway.updateTrack(track);
  }
}
