import { Inject, NotFoundException } from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';

export class GetTrackByIdUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
  ) {}

  async execute(id: string): Promise<TrackObject> {
    const res = await this.trackGateway.getTracks({ id: id });
    if (res.length == 0) throw new NotFoundException('Track not found');
    return res[0];
  }
}
