import { IEventGateway } from '../../domain/gateways/events.gateway';
import { EventObject } from '../../domain/event';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from './entities/event.entity';

export class EventGateway implements IEventGateway {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventsRepository: Repository<EventEntity>,
  ) {}

  async createNewEvent(eventDetails: EventObject): Promise<EventObject> {
    const event: EventEntity = new EventEntity({
      ...eventDetails,
    });

    return await this.eventsRepository.save(event);
  }

  getEvents(filter: any): Promise<EventObject[]> {
    return this.eventsRepository.find({
      where: {
        ...filter,
      },
      relations: filter.id ? ['creator', 'tracks'] : ['creator'],
    });
  }

  async updateEvent(eventDetails: EventObject): Promise<EventObject> {
    const event = await this.eventsRepository.findOne({
      where: {
        id: eventDetails.id,
      },
    });

    return await this.eventsRepository.save({
      ...event,
      ...eventDetails,
    });
  }
}
