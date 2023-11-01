import { Inject } from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';

export class GetTracksUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
  ) {}

  async execute(filter: any): Promise<TrackObject[]> {
    return await this.trackGateway.getTracks(filter);
  }
}
