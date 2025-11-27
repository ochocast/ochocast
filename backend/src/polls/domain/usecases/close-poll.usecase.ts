import { Injectable, Inject } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { PollObject } from '../poll';
import { IPollsGateway } from '../gateways/polls.gateway';
import { PollTimerService } from '../../infra/services/poll-timer.service';

@Injectable()
export class ClosePollUsecase {
  constructor(
    @Inject('IPollsGateway')
    private readonly pollsGateway: IPollsGateway,
    private readonly pollTimerService: PollTimerService,
  ) {}

  async execute(pollId: string): Promise<PollObject> {
    const poll = await this.pollsGateway.getPollById(pollId);

    if (!poll) {
      throw new BadRequestException('Poll not found');
    }

    if (poll.status === 'closed') {
      throw new BadRequestException('Poll is already closed');
    }

    // Cancel any pending timer for this poll
    this.pollTimerService.cancelPollTimer(pollId);

    poll.status = 'closed';
    return this.pollsGateway.updatePoll(poll);
  }
}
