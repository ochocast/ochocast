import { CreateTrackDto } from '../../infra/controllers/dto/create-track.dto';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';

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
  ) {}

  async execute(trackToCreate: CreateTrackDto): Promise<TrackObject> {
    const track = new TrackObject(
      uuid(),
      trackToCreate.name,
      trackToCreate.description,
      trackToCreate.keywords,
      generateStreamKey(),
      false,
      trackToCreate.event,
      new Date(),
    );

    await this.trackGateway.createNewTrack(track);
    return track;
  }
}
