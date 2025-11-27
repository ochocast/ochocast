import { Test, TestingModule } from '@nestjs/testing';
import { PollTimerService } from 'src/polls/infra/services/poll-timer.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PollEntity } from 'src/polls/infra/gateways/entities/poll.entity';
import { ChatGateway } from 'src/chat/chat.gateway';

describe('PollTimerService', () => {
  let service: PollTimerService;
  let mockPollRepository: any;
  let mockChatGateway: any;

  beforeEach(async () => {
    // Mock repositories and gateways
    mockPollRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
    };

    mockChatGateway = {
      broadcastPollClosed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PollTimerService,
        {
          provide: getRepositoryToken(PollEntity),
          useValue: mockPollRepository,
        },
        {
          provide: ChatGateway,
          useValue: mockChatGateway,
        },
      ],
    }).compile();

    service = module.get<PollTimerService>(PollTimerService);
  });

  afterEach(() => {
    service.clearAllTimers();
    jest.clearAllMocks();
  });

  describe('schedulePollClose', () => {
    it('should schedule a poll to close after the specified duration', (done) => {
      const pollId = 'test-poll-123';
      const durationSeconds = 1; // 1 second for testing
      const trackId = 'track-1';

      // Mock the poll retrieval
      mockPollRepository.findOne.mockResolvedValue({
        id: pollId,
        status: 'active',
        duration: durationSeconds,
        trackId,
      });

      mockPollRepository.save.mockResolvedValue({
        id: pollId,
        status: 'closed',
        trackId,
      });

      service.schedulePollClose(pollId, durationSeconds);

      // Check that timer was created
      expect(service.getActiveTimersCount()).toBe(1);

      // Wait for timer to trigger
      setTimeout(() => {
        // Timer should have called broadcastPollClosed
        expect(mockChatGateway.broadcastPollClosed).toHaveBeenCalledWith(
          trackId,
          pollId,
        );
        done();
      }, 1500); // Wait 1.5 seconds to allow timer to execute
    }, 10000); // Increase timeout to 10 seconds

    it('should clear previous timer when scheduling new one with same pollId', () => {
      const pollId = 'test-poll-456';

      service.schedulePollClose(pollId, 10);
      expect(service.getActiveTimersCount()).toBe(1);

      service.schedulePollClose(pollId, 20);
      expect(service.getActiveTimersCount()).toBe(1); // Should still be 1, not 2
    });
  });

  describe('cancelPollTimer', () => {
    it('should cancel an active timer', () => {
      const pollId = 'test-poll-789';

      service.schedulePollClose(pollId, 60);
      expect(service.getActiveTimersCount()).toBe(1);

      service.cancelPollTimer(pollId);
      expect(service.getActiveTimersCount()).toBe(0);
    });

    it('should not throw error when canceling non-existent timer', () => {
      expect(() => {
        service.cancelPollTimer('non-existent-poll');
      }).not.toThrow();
    });
  });

  describe('clearAllTimers', () => {
    it('should clear all active timers', () => {
      service.schedulePollClose('poll-1', 60);
      service.schedulePollClose('poll-2', 120);
      service.schedulePollClose('poll-3', 180);

      expect(service.getActiveTimersCount()).toBe(3);

      service.clearAllTimers();
      expect(service.getActiveTimersCount()).toBe(0);
    });
  });

  describe('initializeTimersForActivePoll', () => {
    it('should initialize timers for active polls that still have time remaining', async () => {
      const now = new Date();
      const futureTime = new Date(now.getTime() + 5000); // 5 seconds in future

      const activePoll = {
        id: 'active-poll-1',
        status: 'active',
        duration: 5, // 5 seconds
        createdAt: new Date(now.getTime() - 1000), // Created 1 second ago
        trackId: 'track-1',
      };

      mockPollRepository.find.mockResolvedValue([activePoll]);

      await service.initializeTimersForActivePoll();

      expect(service.getActiveTimersCount()).toBeGreaterThan(0);
    });

    it('should immediately close polls that have already expired', async () => {
      const now = new Date();
      const expiredPoll = {
        id: 'expired-poll-1',
        status: 'active',
        duration: 1, // 1 second
        createdAt: new Date(now.getTime() - 5000), // Created 5 seconds ago (expired)
        trackId: 'track-1',
      };

      mockPollRepository.find.mockResolvedValue([expiredPoll]);
      mockPollRepository.findOne.mockResolvedValue(expiredPoll);
      mockPollRepository.save.mockResolvedValue(expiredPoll);

      await service.initializeTimersForActivePoll();

      // Expired poll should be closed immediately
      expect(mockPollRepository.save).toHaveBeenCalled();
      expect(mockChatGateway.broadcastPollClosed).toHaveBeenCalled();
    });
  });

  describe('getActiveTimersCount', () => {
    it('should return correct count of active timers', () => {
      expect(service.getActiveTimersCount()).toBe(0);

      service.schedulePollClose('poll-1', 60);
      expect(service.getActiveTimersCount()).toBe(1);

      service.schedulePollClose('poll-2', 60);
      expect(service.getActiveTimersCount()).toBe(2);

      service.cancelPollTimer('poll-1');
      expect(service.getActiveTimersCount()).toBe(1);
    });
  });
});
