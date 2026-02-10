import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';
import { v4 as uuid } from 'uuid';
import { Inject, NotFoundException } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { TrackDto } from 'src/tracks/infra/controllers/dto/track.dto';

const generateStreamKey = (
  length = 32,
  characters = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~!@-^*()_+',
) =>
  Array.from(crypto.getRandomValues(new Uint32Array(length)))
    .map((x) => characters[x % characters.length])
    .join('');

export class CreateNewTrackUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateWay: IUserGateway,
    @Inject('EventGateway')
    private eventGateWay: IEventGateway,
  ) {}

  async execute(trackToCreate: TrackDto): Promise<TrackObject> {
    const event = await this.eventGateWay.getEventById(trackToCreate.eventId);
    if (!event)
      throw new NotFoundException(
        `Event (id ${trackToCreate.eventId}) not found for new track`,
      );

    const speakers: UserObject[] = [];
    for (const s of trackToCreate.speakers) {
      const speaker = await this.userGateWay.getUserById(s);
      if (!speaker)
        throw new NotFoundException(`Speacker (id : ${s}) not found`);
      speakers.push(speaker);
    }

    const track = new TrackObject(
      uuid(),
      trackToCreate.name,
      trackToCreate.description,
      trackToCreate.keywords,
      generateStreamKey(),
      false,
      trackToCreate.eventId,
      new Date(),
      trackToCreate.startDate,
      trackToCreate.endDate,
      speakers,
      null,
    );

    return this.trackGateway.createNewTrack(track);
  }
}
