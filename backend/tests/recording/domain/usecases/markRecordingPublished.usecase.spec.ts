import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { MarkRecordingPublishedUsecase } from 'src/recording/domain/usecases/markRecordingPublished.usecase';

describe('MarkRecordingPublishedUsecase', () => {
  const recordingId = '22222222-2222-4222-8222-222222222222';
  const videoId = '44444444-4444-4444-8444-444444444444';
  const organizer = { id: 'organizer-id', email: 'orga@example.com' };
  const stranger = { id: 'stranger-id', email: 'nobody@example.com' };

  let recordingRepository: any;
  let usecase: MarkRecordingPublishedUsecase;

  beforeEach(() => {
    recordingRepository = {
      getRecordingById: jest.fn().mockResolvedValue({
        id: recordingId,
        trackId: 'track-id',
        visibility: 'unlisted',
        status: 'ready',
      }),
      updateRecording: jest.fn(),
    };
    usecase = new MarkRecordingPublishedUsecase(
      recordingRepository,
      {
        getTracks: jest.fn().mockResolvedValue([
          {
            eventId: 'event-id',
            canBeEditBy: (u: { id: string }) => u.id === organizer.id,
          },
        ]),
      } as any,
      {
        getUserByEmail: jest
          .fn()
          .mockImplementation(async (email: string) =>
            [organizer, stranger].find((u) => u.email === email),
          ),
      } as any,
      {
        getEventById: jest.fn().mockResolvedValue({ canBeEditBy: () => false }),
      } as any,
    );
  });

  it('records when, on whose channel and as which video it was published', async () => {
    await usecase.execute(recordingId, organizer.email, videoId);

    expect(recordingRepository.updateRecording).toHaveBeenCalledWith(
      recordingId,
      {
        visibility: 'published',
        publishedAt: expect.any(Date),
        publishedById: organizer.id,
        publishedVideoId: videoId,
      },
    );
  });

  it('refuses a user who is not the organizer', async () => {
    await expect(
      usecase.execute(recordingId, stranger.email, videoId),
    ).rejects.toThrow(UnauthorizedException);
    expect(recordingRepository.updateRecording).not.toHaveBeenCalled();
  });

  it('rejects an already published recording', async () => {
    recordingRepository.getRecordingById.mockResolvedValue({
      id: recordingId,
      trackId: 'track-id',
      visibility: 'published',
      status: 'ready',
    });

    await expect(
      usecase.execute(recordingId, organizer.email, videoId),
    ).rejects.toThrow(BadRequestException);
  });
});
