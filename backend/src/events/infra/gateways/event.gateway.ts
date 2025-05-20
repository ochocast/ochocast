import { IEventGateway } from '../../domain/gateways/events.gateway';
import { EventObject } from '../../domain/event';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEntity } from './entities/event.entity';
import { toEventEntity, toEventObject } from 'src/common/mapper/event.mapper';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

export class EventGateway implements IEventGateway {
  constructor(
    @InjectRepository(EventEntity)
    private readonly eventsRepository: Repository<EventEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
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
        relations: ['creator', 'tracks', 'tracks.speakers'],
      })
      .then((entities) => entities.map(toEventObject));
  }

  async updateEvent(eventDetails: EventObject): Promise<EventObject> {
    const event = await this.eventsRepository.findOne({
      where: {
        id: eventDetails.id,
      },
    });
    const eventEntity = toEventEntity(eventDetails);
    eventEntity.usersSubscribe = await Promise.all(
      eventDetails.usersSubscribe.map(async (publicUser) => {
        const full = await this.userRepository.findOneBy({ id: publicUser.id });
        if (!full) throw new Error(`User ${publicUser.id} not found`);
        return full;
      }),
    );

    const updatedEntity = this.eventsRepository.merge(event, eventEntity);
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
