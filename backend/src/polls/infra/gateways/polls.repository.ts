import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PollEntity } from './entities/poll.entity';
import { PollVoteEntity } from './entities/poll-vote.entity';
import { IPollsGateway } from '../../domain/gateways/polls.gateway';
import { PollObject } from '../../domain/poll';
import { PollsMapper } from './polls.mapper';

@Injectable()
export class PollsRepository implements IPollsGateway {
  constructor(
    @InjectRepository(PollEntity)
    private readonly pollRepository: Repository<PollEntity>,
    @InjectRepository(PollVoteEntity)
    private readonly pollVoteRepository: Repository<PollVoteEntity>,
    private readonly pollsMapper: PollsMapper,
  ) {}

  async createPoll(poll: PollObject): Promise<PollObject> {
    const pollEntity = new PollEntity();
    pollEntity.question = poll.question;
    pollEntity.responses = poll.responses;
    pollEntity.status = poll.status;
    pollEntity.duration = poll.duration;
    pollEntity.expiresAt = poll.expiresAt;
    pollEntity.trackId = poll.trackId;
    pollEntity.createdById = poll.createdBy.id;

    const saved = await this.pollRepository.save(pollEntity);
    return this.pollsMapper.toDomain(saved);
  }

  async getPollsByTrack(trackId: string): Promise<PollObject[]> {
    const polls = await this.pollRepository.find({
      where: { trackId },
      relations: ['createdBy', 'votes'],
      order: { createdAt: 'DESC' },
    });
    return polls.map((poll) => this.pollsMapper.toDomain(poll));
  }

  async getPollById(pollId: string): Promise<PollObject | null> {
    const poll = await this.pollRepository.findOne({
      where: { id: pollId },
      relations: ['createdBy', 'votes'],
    });
    return poll ? this.pollsMapper.toDomain(poll) : null;
  }

  async updatePoll(poll: PollObject): Promise<PollObject> {
    const pollEntity = await this.pollRepository.findOne({
      where: { id: poll.id },
      relations: ['createdBy', 'votes'],
    });

    if (!pollEntity) {
      throw new Error('Poll not found');
    }

    pollEntity.status = poll.status;
    const saved = await this.pollRepository.save(pollEntity);
    return this.pollsMapper.toDomain(saved);
  }

  async closePoll(pollId: string): Promise<PollObject> {
    const poll = await this.getPollById(pollId);
    if (!poll) {
      throw new Error('Poll not found');
    }
    poll.status = 'closed';
    return this.updatePoll(poll);
  }

  async deletePoll(pollId: string): Promise<void> {
    await this.pollRepository.delete(pollId);
  }

  async addVote(
    pollId: string,
    responseIndex: number,
    userId?: string,
    sessionId?: string,
  ): Promise<PollObject> {
    const pollEntity = await this.pollRepository.findOne({
      where: { id: pollId },
      relations: ['votes', 'createdBy'],
    });

    if (!pollEntity) {
      throw new Error('Poll not found');
    }

    // Create new vote
    const vote = new PollVoteEntity();
    vote.pollId = pollId;
    vote.responseIndex = responseIndex;
    vote.userId = userId;
    vote.sessionId = sessionId;

    await this.pollVoteRepository.save(vote);

    // Refresh and return
    return this.getPollById(pollId);
  }

  async hasUserVoted(
    pollId: string,
    userId?: string,
    sessionId?: string,
  ): Promise<boolean> {
    if (userId) {
      const vote = await this.pollVoteRepository.findOne({
        where: { pollId, userId },
      });
      if (vote) return true;
    }

    if (sessionId) {
      const vote = await this.pollVoteRepository.findOne({
        where: { pollId, sessionId },
      });
      if (vote) return true;
    }

    return false;
  }
}
