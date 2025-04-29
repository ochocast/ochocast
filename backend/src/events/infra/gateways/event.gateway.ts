import { IEventGateway } from '../../domain/gateways/events.gateway';
import { EventObject } from '../../domain/event';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from './entities/event.entity';
import { toEventEntity, toEventObject } from 'src/common/mapper/event.mapper';

export class EventGateway implements IEventGateway {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventsRepository: Repository<EventEntity>,
  ) {}

  async createNewEvent(eventDetails: EventObject): Promise<EventObject> {
    const event: EventEntity = toEventEntity(eventDetails);

    return toEventObject(await this.eventsRepository.save(event));
  }

  getEvents(filter: any): Promise<EventObject[]> {
    return this.eventsRepository
      .find({
        where: {
          ...filter,
        },
        relations: filter.id
          ? ['creator', 'tracks', 'tracks.speakers']
          : ['creator'],
      })
      .then((entities) => entities.map(toEventObject));
  }

  async updateEvent(eventDetails: EventObject): Promise<EventObject> {
    const event = await this.eventsRepository.findOne({
      where: {
        id: eventDetails.id,
      },
    });

    const updatedEntity = this.eventsRepository.merge(
      event,
      toEventEntity(eventDetails),
    );
    const saved = await this.eventsRepository.save(updatedEntity);
    return toEventObject(saved);
  }

  async deleteEvent(eventId: string): Promise<EventObject> {
    const event = await this.eventsRepository.findOneBy({ id: eventId });

    return toEventObject(await this.eventsRepository.remove(event));
  }

  async getEventById(id: string): Promise<EventObject> {
    const entity = await this.eventsRepository.findOne({
      where: { id },
      relations: ['creator', 'tracks', 'tracks.speakers'],
    });

    if (!entity) return null;

    return toEventObject(entity);
  }
}
