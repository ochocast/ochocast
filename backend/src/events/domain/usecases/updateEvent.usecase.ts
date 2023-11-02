import { Inject } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';

export class UpdateEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(event: EventObject): Promise<EventObject> {
    return await this.eventGateway.updateEvent(event);
  }
}
