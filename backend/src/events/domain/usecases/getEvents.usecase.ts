import { Inject } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';

export class GetEventsUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(filter: any): Promise<EventObject[]> {
    return await this.eventGateway.getEvents(filter);
  }
}
