import { Inject } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { EventObject } from '../event';

export class DeleteEventUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(eventId: string): Promise<EventObject> {
    return await this.eventGateway.deleteEvent(eventId);
  }
}
