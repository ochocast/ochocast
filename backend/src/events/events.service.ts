import { Injectable } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Event } from './event.entity';
import { User } from '../users/user.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private readonly eventsRepository: Repository<Event>,
  ) {}

  async insert(eventDetails: CreateEventDto): Promise<Event> {
    const event: Event = new Event({
      ...eventDetails,
      tags: eventDetails.tags.toString(),
      creator: new User({ id: Number(eventDetails.creator) }),
    });
    return await this.eventsRepository.save(event);
  }

  async find(filter: any): Promise<Event[]> {
    return await this.eventsRepository.find({
      where: {
        ...filter,
      },
    });
  }

  async findOne(id: number): Promise<Event> {
    return await this.eventsRepository.findOneBy({
      id: id,
    });
  }
}
