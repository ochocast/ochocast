import { Inject } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { PublicEventObject } from '../publicEvent';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

export class GetEventsUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(
    filter: any,
    currentEmail: string,
  ): Promise<PublicEventObject[]> {
    filter.published = true;
    const events = await this.eventGateway.getEvents(filter);
    const currentUser = await this.userGateway.getUserByEmail(currentEmail);
    return events.map((e) => new PublicEventObject(e, currentUser));
  }
}
