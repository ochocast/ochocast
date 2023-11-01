import { CreateEventDto } from '../../infra/controllers/dto/create-event.dto';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';

export class CreateNewEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(eventToCreate: CreateEventDto): Promise<EventObject> {
    const event = new EventObject(
      uuid(),
      eventToCreate.name,
      eventToCreate.description,
      eventToCreate.category,
      eventToCreate.tags,
      eventToCreate.startDate,
      eventToCreate.endDate,
      false,
      eventToCreate.isPrivate,
      false,
      eventToCreate.imageSlug,
      [],
      eventToCreate.creator,
      new Date(),
    );

    await this.eventGateway.createNewEvent(event);
    return event;
  }
}
