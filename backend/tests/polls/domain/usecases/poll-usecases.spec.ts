import { Test, TestingModule } from '@nestjs/testing';
import { CreatePollUsecase } from 'src/polls/domain/usecases/create-poll.usecase';
import { ClosePollUsecase } from 'src/polls/domain/usecases/close-poll.usecase';
import { PollTimerService } from 'src/polls/infra/services/poll-timer.service';
import { PollObject } from 'src/polls/domain/poll';
import { BadRequestException } from '@nestjs/common';

describe('Poll Usecases with Timer Integration', () => {
  let createPollUsecase: CreatePollUsecase;
  let closePollUsecase: ClosePollUsecase;
  let mockPollsGateway: any;
  let mockPollTimerService: any;

  const mockCreatorInfo = {
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    description: 'Test user',
    picture_id: 'pic-1',
  };

  beforeEach(async () => {
    mockPollsGateway = {
      createPoll: jest.fn(),
      getPollById: jest.fn(),
      updatePoll: jest.fn(),
    };

    mockPollTimerService = {
      schedulePollClose: jest.fn(),
      cancelPollTimer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreatePollUsecase,
        ClosePollUsecase,
        {
          provide: 'IPollsGateway',
          useValue: mockPollsGateway,
        },
        {
          provide: PollTimerService,
          useValue: mockPollTimerService,
        },
      ],
    }).compile();

    createPollUsecase = module.get<CreatePollUsecase>(CreatePollUsecase);
    closePollUsecase = module.get<ClosePollUsecase>(ClosePollUsecase);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CreatePollUsecase', () => {
    it('should create a poll and schedule a timer for it', async () => {
      const createdPoll = new PollObject(
        'poll-123',
        'Test question?',
        ['Yes', 'No'],
        'active',
        120, // 2 minutes
        'track-1',
        mockCreatorInfo,
        new Date(),
        {},
        0,
      );

      mockPollsGateway.createPoll.mockResolvedValue(createdPoll);

      const result = await createPollUsecase.execute(
        'Test question?',
        ['Yes', 'No'],
        120,
        'track-1',
        mockCreatorInfo,
      );

      // Verify poll was created
      expect(mockPollsGateway.createPoll).toHaveBeenCalled();

      // Verify timer was scheduled with correct duration
      expect(mockPollTimerService.schedulePollClose).toHaveBeenCalledWith(
        'poll-123',
        120,
      );

      expect(result).toEqual(createdPoll);
    });

    it('should schedule timers with exact duration in seconds', async () => {
      const testCases = [
        { duration: 30, expectedDurationArg: 30 },
        { duration: 60, expectedDurationArg: 60 },
        { duration: 120, expectedDurationArg: 120 },
        { duration: 300, expectedDurationArg: 300 },
        { duration: 600, expectedDurationArg: 600 },
      ];

      for (const testCase of testCases) {
        mockPollsGateway.createPoll.mockResolvedValue(
          new PollObject(
            'poll-id',
            'Question',
            ['A', 'B'],
            'active',
            testCase.duration,
            'track-1',
            mockCreatorInfo,
            new Date(),
            {},
            0,
          ),
        );

        await createPollUsecase.execute(
          'Question',
          ['A', 'B'],
          testCase.duration,
          'track-1',
          mockCreatorInfo,
        );

        expect(mockPollTimerService.schedulePollClose).toHaveBeenCalledWith(
          'poll-id',
          testCase.expectedDurationArg,
        );
      }
    });
  });

  describe('ClosePollUsecase', () => {
    it('should cancel timer when manually closing a poll', async () => {
      const poll = new PollObject(
        'poll-456',
        'Question?',
        ['A', 'B'],
        'active',
        120,
        'track-1',
        mockCreatorInfo,
        new Date(),
        {},
        0,
      );

      mockPollsGateway.getPollById.mockResolvedValue(poll);
      mockPollsGateway.updatePoll.mockResolvedValue({
        ...poll,
        status: 'closed',
      });

      await closePollUsecase.execute('poll-456');

      // Verify timer was cancelled
      expect(mockPollTimerService.cancelPollTimer).toHaveBeenCalledWith(
        'poll-456',
      );

      // Verify poll was updated to closed
      expect(mockPollsGateway.updatePoll).toHaveBeenCalled();
    });

    it('should throw error if trying to close already closed poll', async () => {
      const closedPoll = new PollObject(
        'poll-789',
        'Question?',
        ['A', 'B'],
        'closed', // Already closed
        120,
        'track-1',
        mockCreatorInfo,
        new Date(),
        {},
        0,
      );

      mockPollsGateway.getPollById.mockResolvedValue(closedPoll);

      await expect(closePollUsecase.execute('poll-789')).rejects.toThrow(
        'Poll is already closed',
      );

      // Timer should NOT be cancelled for already closed polls
      expect(mockPollTimerService.cancelPollTimer).not.toHaveBeenCalled();
    });

    it('should throw error if poll not found', async () => {
      mockPollsGateway.getPollById.mockResolvedValue(null);

      await expect(
        closePollUsecase.execute('non-existent-poll'),
      ).rejects.toThrow('Poll not found');

      // Timer should NOT be cancelled if poll not found
      expect(mockPollTimerService.cancelPollTimer).not.toHaveBeenCalled();
    });
  });
});
