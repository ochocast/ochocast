import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GetTrackRecordingsUsecase } from 'src/recording/domain/usecases/getTrackRecordings.usecase';
import { IRecordingRepositoryGateway } from 'src/recording/domain/gateways/recording-repository.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { RecordingObject } from 'src/recording/domain/recording';

describe('GetTrackRecordingsUsecase', () => {
  let usecase: GetTrackRecordingsUsecase;
  let recordingRepo: jest.Mocked<IRecordingRepositoryGateway>;
  let trackGateway: jest.Mocked<ITrackGateway>;
  let userGateway: jest.Mocked<IUserGateway>;
  let eventGateway: jest.Mocked<IEventGateway>;

  const trackId = '4ea6d8c0-8819-4378-bfee-98bd1bd50be0';
  const email = 'organizer@example.com';
  const user = { id: 'u1' } as any;

  const makeTrack = (canEdit: boolean) =>
    ({ id: trackId, eventId: 'e1', canBeEditBy: () => canEdit }) as any;

  beforeEach(async () => {
    recordingRepo = {
      createRecording: jest.fn(),
      getRecordingsByTrack: jest.fn(),
      getRecordingById: jest.fn(),
      countRecordingsByTrack: jest.fn(),
    };
    trackGateway = {
      createNewTrack: jest.fn(),
      getTracks: jest.fn(),
      updateTrack: jest.fn(),
      deleteTrack: jest.fn(),
    };
    userGateway = {
      getUserByEmail: jest.fn(),
      getUserById: jest.fn(),
    } as any;
    eventGateway = {
      getEventById: jest.fn(),
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetTrackRecordingsUsecase,
        { provide: 'RecordingRepositoryGateway', useValue: recordingRepo },
        { provide: 'TrackGateway', useValue: trackGateway },
        { provide: 'UserGateway', useValue: userGateway },
        { provide: 'EventGateway', useValue: eventGateway },
      ],
    }).compile();

    usecase = moduleRef.get(GetTrackRecordingsUsecase);
  });

  it('lists unlisted segments when the user is an organizer of the track', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(true)]);
    userGateway.getUserByEmail.mockResolvedValue(user);
    const segments: RecordingObject[] = [
      new RecordingObject(
        'r1',
        trackId,
        'm1',
        'unlisted',
        false,
        0,
        null,
        new Date(),
      ),
    ];
    recordingRepo.getRecordingsByTrack.mockResolvedValue(segments);

    const result = await usecase.execute(trackId, email);

    expect(result).toBe(segments);
    expect(recordingRepo.getRecordingsByTrack).toHaveBeenCalledWith(trackId, {
      visibility: 'unlisted',
    });
  });

  it('falls back to event editor rights when the user is not a track speaker', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(false)]);
    userGateway.getUserByEmail.mockResolvedValue(user);
    eventGateway.getEventById.mockResolvedValue({
      canBeEditBy: () => true,
    } as any);
    recordingRepo.getRecordingsByTrack.mockResolvedValue([]);

    await expect(usecase.execute(trackId, email)).resolves.toEqual([]);
  });

  it('rejects a user who is neither track speaker nor event editor', async () => {
    trackGateway.getTracks.mockResolvedValue([makeTrack(false)]);
    userGateway.getUserByEmail.mockResolvedValue(user);
    eventGateway.getEventById.mockResolvedValue({
      canBeEditBy: () => false,
    } as any);

    await expect(usecase.execute(trackId, email)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(recordingRepo.getRecordingsByTrack).not.toHaveBeenCalled();
  });

  it('throws NotFound when the track does not exist', async () => {
    trackGateway.getTracks.mockResolvedValue([]);

    await expect(usecase.execute(trackId, email)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
