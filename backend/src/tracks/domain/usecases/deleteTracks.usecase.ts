import { Inject } from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';

export class DeleteTracksUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
  ) {}

  async execute(id: string): Promise<TrackObject> {
    return await this.trackGateway.deleteTrack(id);
  }
}
