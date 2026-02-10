import { Injectable } from '@nestjs/common';
import { PollEntity } from './entities/poll.entity';
import { PollObject, CreatorInfo } from '../../domain/poll';

@Injectable()
export class PollsMapper {
  toDomain(entity: PollEntity): PollObject {
    const voteCount: Record<number, number> = {};
    let totalVotes = 0;

    if (entity.votes && entity.votes.length > 0) {
      entity.votes.forEach((vote) => {
        voteCount[vote.responseIndex] =
          (voteCount[vote.responseIndex] || 0) + 1;
        totalVotes++;
      });
    }

    const createdBy: CreatorInfo = entity.createdBy
      ? {
          id: entity.createdBy.id,
          firstName: entity.createdBy.firstName,
          lastName: entity.createdBy.lastName,
          description: entity.createdBy.description || '',
          picture_id: entity.createdBy.picture_id || '',
        }
      : {
          id: entity.createdById,
          firstName: 'Unknown',
          lastName: '',
          description: '',
          picture_id: '',
        };

    return new PollObject(
      entity.id,
      entity.question,
      entity.responses,
      entity.status,
      entity.duration,
      entity.trackId,
      createdBy,
      entity.createdAt,
      voteCount,
      totalVotes,
      entity.expiresAt,
    );
  }
}
