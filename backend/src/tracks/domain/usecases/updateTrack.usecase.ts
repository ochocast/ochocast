import { Inject } from '@nestjs/common';
import { ITrackGateway } from '../gateways/tracks.gateway';
import { TrackObject } from '../track';

export class UpdateTrackUsecase {
  constructor(
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
  ) {}

  async execute(track: TrackObject): Promise<TrackObject> {
    return this.trackGateway.updateTrack(track);
  }
}
