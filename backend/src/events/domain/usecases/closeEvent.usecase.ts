import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

export class CloseEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway')
    private readonly userGateway: IUserGateway,
  ) {}

  async execute(eventId: string, userEmail: string): Promise<EventObject> {
    const user = await this.userGateway.getUserByEmail(userEmail);

    if (!user) throw new NotFoundException('User not found');
    const existingEvent = await this.eventGateway.getEventById(eventId);
    if (!existingEvent) throw new NotFoundException('Event not found');
    if (!existingEvent.canBeEditBy(user)) throw new UnauthorizedException();

    existingEvent.closed = true;

    return await this.eventGateway.updateEvent(existingEvent);
  }
}
