import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { PublicEventObject } from '../publicEvent';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

export class UnsubscribeFromEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(id: string, email: string): Promise<PublicEventObject> {
    const event = await this.eventGateway.getEventById(id);
    if (!event) throw new NotFoundException('Event not found');

    const currentUser = await this.userGateway.getUserByEmail(email);
    if (!currentUser) throw new NotFoundException('User not found');

    // Check if user is subscribed to this event
    const userIndex = event.usersSubscribe.findIndex(
      (u) => u.id === currentUser.id,
    );
    if (userIndex === -1)
      throw new UnauthorizedException('User is not subscribed to this event');

    // Remove user from subscribers
    event.usersSubscribe.splice(userIndex, 1);

    return this.eventGateway
      .updateEvent(event)
      .then((e) => new PublicEventObject(e, currentUser));
  }
}
