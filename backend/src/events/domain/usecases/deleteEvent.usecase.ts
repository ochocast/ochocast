import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

export class DeleteEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(eventId: string, currentEmail: string): Promise<EventObject> {
    const currentUser = await this.userGateway.getUserByEmail(currentEmail);
    if (!currentUser) throw new NotFoundException('User not foud');
    const event = await this.eventGateway.getEventById(eventId);
    if (!event) throw new NotFoundException('Event not Found');
    if (!event.canBeEditBy(currentUser))
      throw new UnauthorizedException("Current user can't delete this event");

    return await this.eventGateway.deleteEvent(eventId);
  }
}
