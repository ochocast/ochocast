import { Inject, NotFoundException } from '@nestjs/common';
import { IEventGateway } from '../gateways/events.gateway';
import { PublicEventObject } from '../publicEvent';

export class GetEventByIdUsecase {
  constructor(
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(id: string): Promise<PublicEventObject> {
    const event = await this.eventGateway.getEventById(id);
    if (!event) throw new NotFoundException('Event not found');

    // Vérifier que l'événement est publié (pour accès public non authentifié)
    if (!event.published) {
      throw new NotFoundException('Event not found');
    }

    return new PublicEventObject(event, null);
  }
}
