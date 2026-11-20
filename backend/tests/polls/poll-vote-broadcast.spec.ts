import { PollsController } from '../../src/polls/infra/controllers/polls.controller';
import { ChatGateway } from '../../src/chat/chat.gateway';

describe('poll vote notifications', () => {
  const pollId = 'd0b91721-0318-4eea-8a14-39c12f399ed0';
  const poll = { id: pollId, trackId: 'track-1', totalVotes: 1 };
  it('broadcasts the persisted anonymous vote to the actual track', async () => {
    const vote = { execute: jest.fn().mockResolvedValue(poll) };
    const chat = { broadcastPollAnswered: jest.fn() };
    const controller = new (PollsController as any)({}, vote, {}, {}, {}, chat);
    expect(
      await controller.votePoll(pollId, { responseIndex: 0, sessionId: 's' }),
    ).toEqual(poll);
    expect(chat.broadcastPollAnswered).toHaveBeenCalledWith('track-1', poll);
  });
  it('never broadcasts when persistence rejects the vote', async () => {
    const vote = {
      execute: jest.fn().mockRejectedValue(new Error('duplicate')),
    };
    const chat = { broadcastPollAnswered: jest.fn() };
    const controller = new (PollsController as any)({}, vote, {}, {}, {}, chat);
    await expect(
      controller.votePoll(pollId, { responseIndex: 0, sessionId: 's' }),
    ).rejects.toThrow('duplicate');
    expect(chat.broadcastPollAnswered).not.toHaveBeenCalled();
  });
  it('does not relay arbitrary client supplied poll payloads', async () => {
    const gateway = new ChatGateway(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const emit = jest.fn();
    gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as any;
    const client = {
      connected: true,
      data: { user: { expiresAt: Date.now() + 10000 } },
      emit: jest.fn(),
    } as any;
    await gateway.handlePollAnswered(
      { trackId: 'victim', poll: { id: 'forged' } },
      client,
    );
    expect(emit).not.toHaveBeenCalled();
  });
});
