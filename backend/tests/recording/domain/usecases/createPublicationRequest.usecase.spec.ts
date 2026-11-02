import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { CreatePublicationRequestUsecase } from 'src/recording/domain/usecases/createPublicationRequest.usecase';
import {
  EIGHT_DAYS_AGO,
  ORGANIZER,
  RECORDING_ID,
  SPEAKER,
  STRANGER,
  makeRequest,
  makeRequestGateway,
  makeTrack,
  makeUserGateway,
} from './publicationRequest.fixtures';

describe('CreatePublicationRequestUsecase', () => {
  let usecase: CreatePublicationRequestUsecase;
  let requestGateway: ReturnType<typeof makeRequestGateway>;
  let recordingRepository: any;
  let eventGateway: any;

  const input = {
    recordingId: RECORDING_ID,
    targetUserId: SPEAKER.id,
    title: 'My talk',
    metadata: {
      description: 'desc',
      tags: [],
      internalSpeakers: [],
      externalSpeakers: '',
    },
  };

  beforeEach(() => {
    requestGateway = makeRequestGateway();
    recordingRepository = {
      getRecordingById: jest.fn().mockResolvedValue({
        id: RECORDING_ID,
        trackId: 'track',
        visibility: 'unlisted',
        status: 'ready',
      }),
    };
    eventGateway = {
      getEventById: jest.fn().mockResolvedValue({ canBeEditBy: () => false }),
    };
    usecase = new CreatePublicationRequestUsecase(
      requestGateway,
      recordingRepository,
      { getTracks: jest.fn().mockResolvedValue([makeTrack()]) } as any,
      makeUserGateway(),
      eventGateway,
    );
  });

  it('creates a pending request targeting the speaker', async () => {
    const request = await usecase.execute(input, ORGANIZER.email);

    expect(request.status).toBe('pending');
    expect(request.requesterId).toBe(ORGANIZER.id);
    expect(request.targetUserId).toBe(SPEAKER.id);
    expect(request.metadata.description).toBe('desc');
  });

  it('refuses a user who is not the organizer', async () => {
    await expect(usecase.execute(input, STRANGER.email)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(requestGateway.create).not.toHaveBeenCalled();
  });

  it('rejects a target who is not a speaker of the track', async () => {
    await expect(
      usecase.execute({ ...input, targetUserId: STRANGER.id }, ORGANIZER.email),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects targeting oneself', async () => {
    await expect(
      usecase.execute(
        { ...input, targetUserId: ORGANIZER.id },
        ORGANIZER.email,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an already published recording', async () => {
    recordingRepository.getRecordingById.mockResolvedValue({
      id: RECORDING_ID,
      trackId: 'track',
      visibility: 'published',
      status: 'ready',
    });

    await expect(usecase.execute(input, ORGANIZER.email)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a second pending request for the same recording', async () => {
    requestGateway.findPendingByRecording.mockResolvedValue(makeRequest());

    await expect(usecase.execute(input, ORGANIZER.email)).rejects.toThrow(
      ConflictException,
    );
  });

  it('allows a new request once the pending one has expired', async () => {
    requestGateway.findPendingByRecording.mockResolvedValue(
      makeRequest({ createdAt: EIGHT_DAYS_AGO }),
    );
    requestGateway.update.mockResolvedValue(makeRequest({ status: 'expired' }));

    await expect(
      usecase.execute(input, ORGANIZER.email),
    ).resolves.toBeDefined();
    expect(requestGateway.update).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 'expired' }),
    );
  });
});
