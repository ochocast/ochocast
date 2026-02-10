import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

export class GetPrivateEventByIdUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(id: string, userEmail: string): Promise<EventObject> {
    const user = await this.userGateway.getUserByEmail(userEmail);
    if (!user) throw new NotFoundException('User not found');
    const event = await this.eventGateway.getEventById(id);
    if (!event) throw new NotFoundException('Event not found');
    if (!event.canBeReadBy(user)) throw new UnauthorizedException();
    return event;
  }
}
