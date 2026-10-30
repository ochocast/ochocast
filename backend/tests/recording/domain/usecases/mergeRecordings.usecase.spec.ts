import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { MergeRecordingsUsecase } from 'src/recording/domain/usecases/mergeRecordings.usecase';
import { IMergeJobDispatcher } from 'src/recording/domain/gateways/merge-job-dispatcher.gateway';

describe('MergeRecordingsUsecase', () => {
  const trackId = '33333333-3333-4333-8333-333333333333';
  const organizer = { id: 'organizer-id', email: 'orga@example.com' };
  const stranger = { id: 'stranger-id', email: 'nobody@example.com' };
  const segment = (id: string, index: number) => ({
    id,
    trackId,
    mediaId: `recordings/${trackId}/${id}.mp4`,
    kind: 'segment',
    segmentIndex: index,
  });

  let recordingRepository: any;
  let dispatcher: { enabled: boolean; dispatch: jest.Mock };
  let usecase: MergeRecordingsUsecase;

  beforeEach(() => {
    recordingRepository = {
      getRecordingsByTrack: jest
        .fn()
        .mockResolvedValue([segment('s2', 1), segment('s1', 0)]),
      createRecording: jest.fn().mockImplementation(async (r) => r),
      updateRecording: jest.fn(),
    };
    dispatcher = { enabled: true, dispatch: jest.fn() };
    usecase = new MergeRecordingsUsecase(
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
      dispatcher as IMergeJobDispatcher,
    );
  });

  it('creates a processing montage and dispatches its segments in order', async () => {
    const merged = await usecase.execute(
      trackId,
      ['s2', 's1'],
      organizer.email,
    );

    expect(merged.status).toBe('processing');
    expect(merged.kind).toBe('merged');
    // Sorted with its first segment: the segment numbering is left untouched.
    expect(merged.segmentIndex).toBe(0);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: merged.id,
        trackId,
        sourceKeys: [
          `recordings/${trackId}/s1.mp4`,
          `recordings/${trackId}/s2.mp4`,
        ],
        targetKey: merged.mediaId,
      }),
    );
  });

  it('refuses a user who is not the organizer', async () => {
    await expect(
      usecase.execute(trackId, ['s1', 's2'], stranger.email),
    ).rejects.toThrow(UnauthorizedException);
    expect(recordingRepository.createRecording).not.toHaveBeenCalled();
  });

  it('requires at least two segments', async () => {
    await expect(
      usecase.execute(trackId, ['s1'], organizer.email),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates nothing when merging is not configured', async () => {
    dispatcher.enabled = false;

    await expect(
      usecase.execute(trackId, ['s1', 's2'], organizer.email),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(recordingRepository.createRecording).not.toHaveBeenCalled();
  });

  it('marks the montage failed when the job cannot be queued', async () => {
    dispatcher.dispatch.mockRejectedValue(new Error('queue unavailable'));

    await expect(
      usecase.execute(trackId, ['s1', 's2'], organizer.email),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(recordingRepository.updateRecording).toHaveBeenCalledWith(
      expect.any(String),
      { status: 'failed' },
    );
  });
});
