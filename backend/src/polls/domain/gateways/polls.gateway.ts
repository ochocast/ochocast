import { PollObject } from '../poll';

export interface IPollsGateway {
  createPoll(poll: PollObject): Promise<PollObject>;
  getPollsByTrack(trackId: string): Promise<PollObject[]>;
  getPollById(pollId: string): Promise<PollObject | null>;
  updatePoll(poll: PollObject): Promise<PollObject>;
  closePoll(pollId: string): Promise<PollObject>;
  deletePoll(pollId: string): Promise<void>;
  addVote(
    pollId: string,
    responseIndex: number,
    userId?: string,
    sessionId?: string,
  ): Promise<PollObject>;
  hasUserVoted(
    pollId: string,
    userId?: string,
    sessionId?: string,
  ): Promise<boolean>;
}
