import { Inject } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { PublicEventObject } from '../publicEvent';

export class GetEventsUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(
    filter: any,
    currentEmail: string,
  ): Promise<PublicEventObject[]> {
    filter.published = true;
    const events = await this.eventGateway.getEvents(filter);
    return events.map((e) => new PublicEventObject(e, currentEmail));
  }
}
