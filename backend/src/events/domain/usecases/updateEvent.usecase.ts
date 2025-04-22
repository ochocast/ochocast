import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

export class UpdateEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway')
    private readonly userGateway: IUserGateway,
  ) {}

  async execute(
    eventUpdate: EventObject,
    userEmail: string,
  ): Promise<EventObject> {
    const user = await this.userGateway.getUserByEmail(userEmail);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const existingEvent = await this.eventGateway.getEventById(eventUpdate.id);

    if (!existingEvent) {
      throw new NotFoundException('Event not found');
    }

    if (existingEvent.creatorId !== user.id) {
      throw new UnauthorizedException();
    }

    return await this.eventGateway.updateEvent(eventUpdate);
  }
}
