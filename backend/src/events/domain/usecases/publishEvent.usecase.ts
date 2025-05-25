import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { PublicEventObject } from '../publicEvent';

export class PublishEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('UserGateway')
    private readonly userGateway: IUserGateway,
  ) {}

  async execute(
    eventId: string,
    userEmail: string,
  ): Promise<PublicEventObject> {
    const user = await this.userGateway.getUserByEmail(userEmail);

    if (!user) throw new NotFoundException('User not found');
    const existingEvent = await this.eventGateway.getEventById(eventId);
    if (!existingEvent) throw new NotFoundException('Event not found');
    if (!existingEvent.canBeEditBy(user)) throw new UnauthorizedException();

    existingEvent.published = true;

    return new PublicEventObject(
      await this.eventGateway.updateEvent(existingEvent),
      user,
    );
  }
}
