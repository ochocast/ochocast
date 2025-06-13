import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';
import { TrackDto } from 'src/tracks/infra/controllers/dto/track.dto';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

export class UpdateTrackUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateWay: IEventGateway,
  ) {}

  async execute(
    id: string,
    trackData: TrackDto,
    email: string,
  ): Promise<TrackObject> {
    const tracks = await this.trackGateway.getTracks({ id: id });
    if (tracks.length == 0)
      throw new NotFoundException(`Track (id ${id}) not found`);
    const track = tracks[0];
    const currentUser = await this.userGateway.getUserByEmail(email);
    if (!currentUser)
      throw new NotFoundException(`User (email : ${email}) not found`);
    let event = undefined;
    if (!track.canBeEditBy(currentUser)) {
      event = await this.eventGateWay.getEventById(track.eventId);
      if (!event.canBeEditBy(currentUser)) throw new UnauthorizedException();
    }
    if (track.eventId !== trackData.eventId)
      throw new UnauthorizedException('EventId of a track can not be change');

    const speakers: UserObject[] = [];
    for (const s of trackData.speakers) {
      const speaker = await this.userGateway.getUserById(s);
      if (!speaker)
        throw new NotFoundException(`Speacker (id : ${s}) not found`);
      speakers.push(speaker);
    }

    track.name = trackData.name;
    track.description = trackData.description;
    track.keywords = trackData.keywords;
    track.endDate = trackData.endDate;
    track.startDate = trackData.startDate;
    track.speakers = speakers;

    if (!track.canBeEditBy(currentUser)) {
      if (!event) event = await this.eventGateWay.getEventById(track.eventId);
      if (!event.canBeEditBy(currentUser))
        throw new UnauthorizedException('Speaker cannot remove himself!');
    }
    return this.trackGateway.updateTrack(track);
  }
}
