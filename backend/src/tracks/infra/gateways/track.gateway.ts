import { ITrackGateway } from '../../domain/gateways/tracks.gateway';
import { TrackObject } from '../../domain/track';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackEntity } from './entities/track.entity';

export class TrackGateway implements ITrackGateway {
  constructor(
    @InjectRepository(TrackEntity)
    private readonly tracksRepository: Repository<TrackEntity>,
  ) {}

  async createNewTrack(trackDetails: TrackObject): Promise<TrackObject> {
    const track: TrackEntity = new TrackEntity({
      ...trackDetails,
    });

    return await this.tracksRepository.save(track);
  }

  getTracks(filter: any): Promise<TrackObject[]> {
    return this.tracksRepository.find({
      where: {
        ...filter,
      },
    });
  }

  async updateTrack(trackDetails: TrackObject): Promise<TrackObject> {
    const track = await this.tracksRepository.findOne({
      where: {
        id: trackDetails.id,
      },
    });

    return await this.tracksRepository.save({
      ...track,
      ...trackDetails,
    });
  }
}
