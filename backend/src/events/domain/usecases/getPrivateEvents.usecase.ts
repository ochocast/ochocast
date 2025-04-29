import { Inject, NotFoundException } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { PublicEventObject } from '../publicEvent';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

export class GetPrivateEventsUsecase {
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
    const currentUser = await this.userGateway.getUserByEmail(currentEmail);
    if (!currentUser) throw new NotFoundException('User not found');
    filter.creatorId = currentUser.id;
    return (await this.eventGateway.getEvents(filter)).map(
      (e) => new PublicEventObject(e, currentEmail),
    );
  }
}
