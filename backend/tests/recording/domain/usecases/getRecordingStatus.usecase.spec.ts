import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GetRecordingStatusUsecase } from 'src/recording/domain/usecases/getRecordingStatus.usecase';
import { IRecordingVMGateway } from 'src/recording/domain/gateways/recording-vm.gateway';
import { IRecordingErrorGateway } from 'src/recording/domain/gateways/recording-error.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

describe('GetRecordingStatusUsecase', () => {
  let usecase: GetRecordingStatusUsecase;
  let trackGateway: jest.Mocked<ITrackGateway>;
  let userGateway: jest.Mocked<IUserGateway>;
  let eventGateway: jest.Mocked<IEventGateway>;
  let vmGateway: jest.Mocked<IRecordingVMGateway>;
  let errorGateway: jest.Mocked<IRecordingErrorGateway>;

  const trackId = '4ea6d8c0-8819-4378-bfee-98bd1bd50be0';
  const email = 'organizer@example.com';
  const user = { id: 'u1' } as any;

  const makeTrack = (armed: boolean, canEdit = true) =>
    ({
      id: trackId,
      eventId: 'e1',
      recordingArmed: armed,
      canBeEditBy: () => canEdit,
    }) as any;

  beforeEach(async () => {
    trackGateway = {
      createNewTrack: jest.fn(),
      getTracks: jest.fn(),
      updateTrack: jest.fn(),
      deleteTrack: jest.fn(),
    };
    userGateway = {
      getUserByEmail: jest.fn().mockResolvedValue(user),
      getUserById: jest.fn(),
    } as any;
    eventGateway = {
      getEventById: jest.fn(),
    } as any;
    vmGateway = {
      startRecording: jest.fn(),
      stopRecording: jest.fn(),
      getStatus: jest.fn().mockResolvedValue({ status: 'idle' }),
      isLiveActive: jest.fn(),
    };
    errorGateway = {
      setError: jest.fn(),
      clearError: jest.fn(),
      getError: jest.fn().mockResolvedValue(null),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetRecordingStatusUsecase,
        { provide: 'TrackGateway', useValue: trackGateway },
        { provide: 'UserGateway', useValue: userGateway },
        { provide: 'EventGateway', useValue: eventGateway },
        { provide: 'RecordingVMGateway', useValue: vmGateway },
        { provide: 'RecordingErrorGateway', useValue: errorGateway },
      ],
    }).compile();

    usecase = moduleRef.get(GetRecordingStatusUsecase);
  });

  it('is disabled when the track is not armed', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(false)]);

    expect(await usecase.execute(trackId, email)).toEqual({
      state: 'disabled',
      error: null,
    });
  });

  it('is armed and waiting when armed without a running recorder', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true)]);

    expect(await usecase.execute(trackId, email)).toEqual({
      state: 'armed_waiting',
      error: null,
    });
  });

  it('is recording when the recorder runs on the track', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true)]);
    vmGateway.getStatus.mockResolvedValue({ status: 'recording' });

    expect((await usecase.execute(trackId, email)).state).toBe('recording');
  });

  it('reports a recorder still running on a disarmed track', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(false)]);
    vmGateway.getStatus.mockResolvedValue({ status: 'recording' });

    expect((await usecase.execute(trackId, email)).state).toBe('recording');
  });

  it('reports the last recorder failure', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true)]);
    const occurredAt = new Date();
    errorGateway.getError.mockResolvedValue({
      kind: 'start_failed',
      occurredAt,
    });

    expect(await usecase.execute(trackId, email)).toEqual({
      state: 'error',
      error: { kind: 'start_failed', occurredAt },
    });
  });

  it('reports an unreachable recorder on an armed track', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true)]);
    vmGateway.getStatus.mockRejectedValue(new Error('VM unreachable'));

    expect(await usecase.execute(trackId, email)).toEqual({
      state: 'error',
      error: { kind: 'recorder_unreachable', occurredAt: null },
    });
  });

  it('refuses a user who is not the organizer', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true, false)]);
    eventGateway.getEventById.mockResolvedValue({
      canBeEditBy: () => false,
    } as any);

    await expect(usecase.execute(trackId, email)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(vmGateway.getStatus).not.toHaveBeenCalled();
  });

  it('throws NotFound when the track does not exist', async () => {
    trackGateway.getTracks.mockResolvedValue([]);

    await expect(usecase.execute(trackId, email)).rejects.toThrow(
      NotFoundException,
    );
  });
});
