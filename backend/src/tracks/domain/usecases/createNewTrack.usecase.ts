import { CreateTrackDto } from '../../infra/controllers/dto/create-track.dto';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';

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
  ) {}

  async execute(trackToCreate: CreateTrackDto): Promise<TrackObject> {
    const speakers: UserObject[] = [];
    for (const s of trackToCreate.speakers) {
      speakers.push(await this.userGateWay.getUserById(s));
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
      speakers,
    );

    return this.trackGateway.createNewTrack(track);
  }
}
