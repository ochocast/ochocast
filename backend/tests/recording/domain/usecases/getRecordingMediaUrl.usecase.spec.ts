import { Test } from '@nestjs/testing';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { GetRecordingMediaUrlUsecase } from 'src/recording/domain/usecases/getRecordingMediaUrl.usecase';
import { IRecordingRepositoryGateway } from 'src/recording/domain/gateways/recording-repository.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { RecordingObject } from 'src/recording/domain/recording';

describe('GetRecordingMediaUrlUsecase (authorization)', () => {
  let usecase: GetRecordingMediaUrlUsecase;
  let recordingRepo: jest.Mocked<IRecordingRepositoryGateway>;
  let trackGateway: jest.Mocked<ITrackGateway>;
  let userGateway: jest.Mocked<IUserGateway>;
  let eventGateway: jest.Mocked<IEventGateway>;

  const recordingId = 'ad1b1aa3-d2b3-4041-bfe9-a511bcbe27a2';
  const trackId = '4ea6d8c0-8819-4378-bfee-98bd1bd50be0';
  const email = 'someone@example.com';

  const recording = new RecordingObject(
    recordingId,
    trackId,
    'recordings/x/y/original.mp4',
    'unlisted',
    false,
    0,
    null,
    new Date(),
  );

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
    userGateway = { getUserByEmail: jest.fn(), getUserById: jest.fn() } as any;
    eventGateway = { getEventById: jest.fn() } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        GetRecordingMediaUrlUsecase,
        { provide: 'RecordingRepositoryGateway', useValue: recordingRepo },
        { provide: 'TrackGateway', useValue: trackGateway },
        { provide: 'UserGateway', useValue: userGateway },
        { provide: 'EventGateway', useValue: eventGateway },
        { provide: 's3Client', useValue: {} },
      ],
    }).compile();

    usecase = moduleRef.get(GetRecordingMediaUrlUsecase);
  });

  it('rejects a user who is neither track speaker nor event editor', async () => {
    recordingRepo.getRecordingById.mockResolvedValue(recording);
    trackGateway.getTracks.mockResolvedValue([
      { id: trackId, eventId: 'e1', canBeEditBy: () => false } as any,
    ]);
    userGateway.getUserByEmail.mockResolvedValue({ id: 'u1' } as any);
    eventGateway.getEventById.mockResolvedValue({
      canBeEditBy: () => false,
    } as any);

    await expect(usecase.execute(recordingId, email)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws NotFound when the recording does not exist', async () => {
    recordingRepo.getRecordingById.mockResolvedValue(null);

    await expect(usecase.execute(recordingId, email)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
