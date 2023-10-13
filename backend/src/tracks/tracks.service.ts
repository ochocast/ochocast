import { Injectable } from '@nestjs/common';
import { CreateTrackDto } from './dto/create-track.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Track } from './track.entity';
import { Event } from '../events/event.entity';

@Injectable()
export class TracksService {
  constructor(
    @InjectRepository(Track)
    private readonly tracksRepository: Repository<Track>,
  ) {}

  async insert(trackDetails: CreateTrackDto): Promise<Track> {
    console.log(trackDetails);

    const track: Track = new Track({
      ...trackDetails,
      keywords: trackDetails.keywords.toString(),
      event: new Event({ id: Number(trackDetails.event) }),
      closed: false,
    });

    return await this.tracksRepository.save(track);
  }

  async find(filter: any): Promise<Track[]> {
    return await this.tracksRepository.find({
      where: {
        ...filter,
      },
    });
  }

  async findOne(id: number): Promise<Track> {
    return await this.tracksRepository.findOneBy({
      id: id,
    });
  }
}
