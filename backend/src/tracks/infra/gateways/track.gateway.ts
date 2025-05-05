import { ITrackGateway } from '../../domain/gateways/tracks.gateway';
import { TrackObject } from '../../domain/track';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { TrackEntity } from './entities/track.entity';
import { toTrackEntity, toTrackObject } from 'src/common/mapper/track.mapper';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class TrackGateway implements ITrackGateway {
  constructor(
    @InjectRepository(TrackEntity)
    private readonly tracksRepository: Repository<TrackEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async createNewTrack(trackDetails: TrackObject): Promise<TrackObject> {
    const track: TrackEntity = toTrackEntity(trackDetails);
    track.speakers = await Promise.all(
      trackDetails.speakers.map(async (publicUser) => {
        const full = await this.userRepository.findOneBy({ id: publicUser.id });
        if (!full) throw new Error(`User ${publicUser.id} not found`);
        return full;
      }),
    );

    if (trackDetails.speakers && trackDetails.speakers.length > 0) {
      const speakerEntities = await this.userRepository.findBy({
        id: In(trackDetails.speakers.map((e) => e.id)),
      });
      track.speakers = speakerEntities;
    }

    return toTrackObject(await this.tracksRepository.save(track));
  }

  getTracks(filter: any): Promise<TrackObject[]> {
    return this.tracksRepository
      .find({
        where: {
          ...filter,
        },
        relations: ['event', 'speakers'],
      })
      .then((entities) => entities.map(toTrackObject));
  }

  async updateTrack(trackDetails: TrackObject): Promise<TrackObject> {
    const track = await this.tracksRepository.findOne({
      where: {
        id: trackDetails.id,
      },
      relations: ['speakers'],
    });

    const newTrack = toTrackEntity(trackDetails);
    newTrack.speakers = await Promise.all(
      trackDetails.speakers.map(async (publicUser) => {
        const full = await this.userRepository.findOneBy({ id: publicUser.id });
        if (!full) throw new Error(`User ${publicUser.id} not found`);
        return full;
      }),
    );

    const updatedEntity = this.tracksRepository.merge(track, newTrack);

    if (trackDetails.speakers && trackDetails.speakers.length > 0) {
      const speakerEntities = await this.userRepository.findBy({
        id: In(trackDetails.speakers.map((e) => e.id)),
      });
      updatedEntity.speakers = speakerEntities;
    }

    const saved = await this.tracksRepository.save(updatedEntity);
    return toTrackObject(saved);
  }

  async deleteTrack(id: string): Promise<TrackObject> {
    const track = await this.tracksRepository.findOneBy({ id: id });

    return toTrackObject(await this.tracksRepository.remove(track));
  }
}
