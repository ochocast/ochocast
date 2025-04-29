import { EventDataDto } from '../../infra/controllers/dto/event-data.dto';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';
import { v4 as uuid } from 'uuid';
import { Inject, NotFoundException } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

export class CreateNewEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway') private userGateway: IUserGateway,
  ) {}

  async execute(
    currentUserEmail: string,
    eventToCreate: EventDataDto,
  ): Promise<EventObject> {
    const user = await this.userGateway.getUserByEmail(currentUserEmail);

    if (!user) throw new NotFoundException('User not found');

    const event = new EventObject(
      uuid(),
      eventToCreate.name,
      eventToCreate.description,
      [],
      eventToCreate.startDate,
      eventToCreate.endDate,
      false,
      true,
      false,
      eventToCreate.imageSlug,
      [],
      user.id,
      new Date(),
      user,
    );

    await this.eventGateway.createNewEvent(event);
    return event;
  }
}
