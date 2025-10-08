import { Inject, NotFoundException } from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { PublicEventObject } from 'src/events/domain/publicEvent';

export class GetTrackByIdUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(id: string): Promise<TrackObject> {
    const res = await this.trackGateway.getTracks({ id: id });
    if (res.length == 0) throw new NotFoundException('Track not found');
    const event = await this.eventGateway.getEventById(res[0].eventId);
    res[0].event = new PublicEventObject(event, null);
    return res[0];
  }
}
