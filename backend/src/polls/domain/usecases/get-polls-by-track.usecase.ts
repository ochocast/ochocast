import { Injectable, Inject } from '@nestjs/common';
import { PollObject } from '../poll';
import { IPollsGateway } from '../gateways/polls.gateway';

@Injectable()
export class GetPollsByTrackUsecase {
  constructor(
    @Inject('IPollsGateway')
    private readonly pollsGateway: IPollsGateway,
  ) {}

  async execute(trackId: string): Promise<PollObject[]> {
    return this.pollsGateway.getPollsByTrack(trackId);
  }
}
