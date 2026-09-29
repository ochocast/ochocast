import { Test } from '@nestjs/testing';
import { HandleLiveEventUsecase } from 'src/recording/domain/usecases/handleLiveEvent.usecase';
import { StartRecordingUsecase } from 'src/recording/domain/usecases/startRecording.usecase';
import { StopRecordingUsecase } from 'src/recording/domain/usecases/stopRecording.usecase';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';

describe('HandleLiveEventUsecase', () => {
  let usecase: HandleLiveEventUsecase;
  let trackGateway: jest.Mocked<ITrackGateway>;
  let startRecording: { execute: jest.Mock };
  let stopRecording: { execute: jest.Mock };

  const trackId = '4ea6d8c0-8819-4378-bfee-98bd1bd50be0';

  beforeEach(async () => {
    trackGateway = {
      createNewTrack: jest.fn(),
      getTracks: jest.fn(),
      updateTrack: jest.fn(),
      deleteTrack: jest.fn(),
    };
    startRecording = { execute: jest.fn() };
    stopRecording = { execute: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        HandleLiveEventUsecase,
        { provide: 'TrackGateway', useValue: trackGateway },
        { provide: StartRecordingUsecase, useValue: startRecording },
        { provide: StopRecordingUsecase, useValue: stopRecording },
      ],
    }).compile();

    usecase = moduleRef.get(HandleLiveEventUsecase);
  });

  it('starts recording when a live starts on an armed track', async () => {
    trackGateway.getTracks.mockResolvedValue([
      { id: trackId, recordingArmed: true } as any,
    ]);

    await usecase.execute(trackId, 'started');

    expect(startRecording.execute).toHaveBeenCalledWith(trackId);
  });

  it('does nothing when a live starts on a disarmed track', async () => {
    trackGateway.getTracks.mockResolvedValue([
      { id: trackId, recordingArmed: false } as any,
    ]);

    await usecase.execute(trackId, 'started');

    expect(startRecording.execute).not.toHaveBeenCalled();
  });

  it('ignores a live on an unknown track', async () => {
    trackGateway.getTracks.mockResolvedValue([]);

    await usecase.execute(trackId, 'started');

    expect(startRecording.execute).not.toHaveBeenCalled();
  });

  it('stops recording when the live stops', async () => {
    await usecase.execute(trackId, 'stopped');

    expect(stopRecording.execute).toHaveBeenCalledWith(trackId);
    expect(startRecording.execute).not.toHaveBeenCalled();
  });
});
