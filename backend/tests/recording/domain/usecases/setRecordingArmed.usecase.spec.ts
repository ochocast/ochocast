import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SetRecordingArmedUsecase } from 'src/recording/domain/usecases/setRecordingArmed.usecase';
import { StartRecordingUsecase } from 'src/recording/domain/usecases/startRecording.usecase';
import { StopRecordingUsecase } from 'src/recording/domain/usecases/stopRecording.usecase';
import { IRecordingVMGateway } from 'src/recording/domain/gateways/recording-vm.gateway';
import { IRecordingErrorGateway } from 'src/recording/domain/gateways/recording-error.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

describe('SetRecordingArmedUsecase', () => {
  let usecase: SetRecordingArmedUsecase;
  let trackGateway: jest.Mocked<ITrackGateway>;
  let userGateway: jest.Mocked<IUserGateway>;
  let eventGateway: jest.Mocked<IEventGateway>;
  let vmGateway: jest.Mocked<IRecordingVMGateway>;
  let errorGateway: jest.Mocked<IRecordingErrorGateway>;
  let startRecording: { execute: jest.Mock };
  let stopRecording: { execute: jest.Mock };

  const trackId = '4ea6d8c0-8819-4378-bfee-98bd1bd50be0';
  const email = 'organizer@example.com';
  const user = { id: 'u1' } as any;

  const makeTrack = (canEdit: boolean) =>
    ({
      id: trackId,
      eventId: 'e1',
      recordingArmed: false,
      canBeEditBy: () => canEdit,
    }) as any;

  beforeEach(async () => {
    trackGateway = {
      createNewTrack: jest.fn(),
      getTracks: jest.fn(),
      updateTrack: jest.fn().mockImplementation(async (t) => t),
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
      getStatus: jest.fn(),
      isLiveActive: jest.fn().mockResolvedValue(false),
    };
    errorGateway = {
      setError: jest.fn(),
      clearError: jest.fn(),
      getError: jest.fn(),
    };
    startRecording = { execute: jest.fn() };
    stopRecording = { execute: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SetRecordingArmedUsecase,
        { provide: 'TrackGateway', useValue: trackGateway },
        { provide: 'UserGateway', useValue: userGateway },
        { provide: 'EventGateway', useValue: eventGateway },
        { provide: 'RecordingVMGateway', useValue: vmGateway },
        { provide: 'RecordingErrorGateway', useValue: errorGateway },
        { provide: StartRecordingUsecase, useValue: startRecording },
        { provide: StopRecordingUsecase, useValue: stopRecording },
      ],
    }).compile();

    usecase = moduleRef.get(SetRecordingArmedUsecase);
  });

  it('arms the track before any live, without starting the recorder', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true)]);

    const result = await usecase.execute(trackId, true, email);

    expect(result).toEqual({ recordingArmed: true });
    expect(trackGateway.updateTrack).toHaveBeenCalledWith(
      expect.objectContaining({ recordingArmed: true }),
    );
    expect(startRecording.execute).not.toHaveBeenCalled();
  });

  it('starts the recorder immediately when armed during a live', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true)]);
    vmGateway.isLiveActive.mockResolvedValue(true);

    await usecase.execute(trackId, true, email);

    expect(startRecording.execute).toHaveBeenCalledWith(trackId);
  });

  it('stops the recorder immediately when disarmed', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true)]);

    const result = await usecase.execute(trackId, false, email);

    expect(result).toEqual({ recordingArmed: false });
    expect(stopRecording.execute).toHaveBeenCalledWith(trackId);
    expect(errorGateway.clearError).toHaveBeenCalledWith(trackId);
  });

  it('keeps the flag saved when the recorder cannot be reached', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true)]);
    vmGateway.isLiveActive.mockResolvedValue(true);
    startRecording.execute.mockRejectedValue(new Error('VM unreachable'));

    const result = await usecase.execute(trackId, true, email);

    expect(result).toEqual({ recordingArmed: true });
  });

  it('allows the organizer of the parent event', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(false)]);
    eventGateway.getEventById.mockResolvedValue({
      canBeEditBy: () => true,
    } as any);

    const result = await usecase.execute(trackId, true, email);

    expect(result).toEqual({ recordingArmed: true });
  });

  it('refuses a user who is not the organizer', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(false)]);
    eventGateway.getEventById.mockResolvedValue({
      canBeEditBy: () => false,
    } as any);

    await expect(usecase.execute(trackId, true, email)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(trackGateway.updateTrack).not.toHaveBeenCalled();
    expect(startRecording.execute).not.toHaveBeenCalled();
  });

  it('throws NotFound when the track does not exist', async () => {
    trackGateway.getTracks.mockResolvedValue([]);

    await expect(usecase.execute(trackId, true, email)).rejects.toThrow(
      NotFoundException,
    );
  });
});
