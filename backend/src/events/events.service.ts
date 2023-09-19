import { Injectable } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from '../entities/event.entity';

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event)
    private eventsRepository: Repository<Event>,
  ) {}
  async insert(eventDetails: CreateEventDto): Promise<EventEntity> {
    console.log(eventDetails);
    const eventEntity: EventEntity = EventEntity.create();
    const {
      name,
      description,
      category,
      tags,
      date,
      creator,
      isPrivate,
      imageSlug,
    } = eventDetails;

    eventEntity.name = name;
    eventEntity.description = description;
    eventEntity.category = category;
    eventEntity.tags = tags.toString();
    eventEntity.date = date;
    eventEntity.creator = creator;
    eventEntity.private = isPrivate;
    eventEntity.imageslug = imageSlug;

    await this.eventsRepository.save(eventEntity);
    return eventEntity;
  }

  async getAllEvents() {
    return await this.eventsRepository.find();
  }
}
