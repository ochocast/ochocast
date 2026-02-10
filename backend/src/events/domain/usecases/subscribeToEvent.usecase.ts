import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { PublicEventObject } from '../publicEvent';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { PublicUserObject } from 'src/users/domain/publicUser';

export class SubscribeToEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(id: string, email: string): Promise<PublicEventObject> {
    const event = await this.eventGateway.getEventById(id);
    if (!event) throw new NotFoundException('Event not found');
    if (!event.published)
      throw new UnauthorizedException(
        'subscibe to not publish event is not possible',
      );
    const currentUser = await this.userGateway.getUserByEmail(email);
    if (!currentUser) throw new NotFoundException('User not found');

    // Prevent the event creator from subscribing to their own event
    if (event.creator.id === currentUser.id)
      throw new UnauthorizedException(
        'Event creator cannot subscribe to their own event',
      );

    if (!event.usersSubscribe.some((e) => e.id === currentUser.id))
      event.usersSubscribe.push(new PublicUserObject(currentUser));
    else throw new UnauthorizedException('User can not subscribe 2 time');

    return this.eventGateway
      .updateEvent(event)
      .then((e) => new PublicEventObject(e, currentUser));
  }
}
