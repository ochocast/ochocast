import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { PollObject } from '../poll';
import { IPollsGateway } from '../gateways/polls.gateway';

@Injectable()
export class VotePollUsecase {
  constructor(
    @Inject('IPollsGateway')
    private readonly pollsGateway: IPollsGateway,
  ) {}

  async execute(
    pollId: string,
    responseIndex: number,
    userId?: string,
    sessionId?: string,
  ): Promise<PollObject> {
    const poll = await this.pollsGateway.getPollById(pollId);

    if (!poll) {
      throw new BadRequestException('Poll not found');
    }

    if (poll.status !== 'active') {
      throw new BadRequestException('Poll is not active');
    }

    // Check if poll has expired based on server time
    // Convert expiresAt to Date if needed, then compare
    const now = new Date();
    const expiresAtTime = new Date(poll.expiresAt).getTime();
    const nowTime = now.getTime();

    // If the vote is coming in after expiration, reject it
    // 5 second grace period for network/processing delays and clock desync
    if (nowTime > expiresAtTime + 5000) {
      throw new BadRequestException('Poll has expired');
    }

    if (responseIndex < 0 || responseIndex >= poll.responses.length) {
      throw new BadRequestException('Invalid response index');
    }

    // At least one identifier must be provided
    if (!userId && !sessionId) {
      throw new BadRequestException(
        'Either userId or sessionId must be provided',
      );
    }

    const hasVoted = await this.pollsGateway.hasUserVoted(
      pollId,
      userId,
      sessionId,
    );
    if (hasVoted) {
      throw new BadRequestException('User has already voted for this poll');
    }

    return this.pollsGateway.addVote(pollId, responseIndex, userId, sessionId);
  }
}
