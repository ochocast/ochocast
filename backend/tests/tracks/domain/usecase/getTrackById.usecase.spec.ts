import { NotFoundException } from '@nestjs/common';
import { EventObject } from 'src/events/domain/event';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { TrackObject } from 'src/tracks/domain/track';
import { GetTrackByIdUsecase } from 'src/tracks/domain/usecases/getTrackById.usecase';
import { UserObject } from 'src/users/domain/user';

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

describe('getTracktByIdUsecase', () => {
  let getTrackByIdUsecase: GetTrackByIdUsecase;
  let trackGatewayMock: jest.Mocked<ITrackGateway>;

  /*
    Data Test 
   */

  const now = new Date();
  const eventId = 'event-123';
  const validSpeakerId = 'speaker-1';
  const otherSpeakerId = 'speaker-2';
  const trackId = 'idtrack1';
  const trackId2 = 'idtrack2';

  const mockUser: UserObject = {
    id: validSpeakerId,
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    role: 'speaker',
    events: [],
    comments: [],
    videos: [],
    videosAsSpeaker: [],
    description: '',
    createdAt: now,
    picture_id: '',
  };

  const mockUser2: UserObject = {
    id: otherSpeakerId,
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    role: 'speaker',
    events: [],
    comments: [],
    videos: [],
    videosAsSpeaker: [],
    description: '',
    createdAt: now,
    picture_id: '',
  };

  const mockEvent: EventObject = new EventObject(
    eventId,
    'Halloween',
    'Spooky Event',
    ['spooky'],
    now,
    now,
    true,
    false,
    false,
    'image.jpg',
    [],
    'creator-1',
    now,
    mockUser,
    [],
  );

  const trackList: TrackObject[] = [
    new TrackObject(
      trackId,
      'name',
      'desc',
      [],
      'key',
      false,
      mockEvent.id,
      now,
      now,
      now,
      [mockUser],
    ),
    new TrackObject(
      trackId2,
      'name2',
      'desc2',
      [],
      'key2',
      false,
      mockEvent.id,
      now,
      now,
      now,
      [mockUser2],
    ),
  ];

  beforeEach(() => {
    trackGatewayMock = {
      createNewTrack: jest.fn(),
      getTracks: jest.fn(),
      updateTrack: jest.fn(),
      deleteTrack: jest.fn(),
    };

    getTrackByIdUsecase = new GetTrackByIdUsecase(trackGatewayMock);

    /*
    Expected Moke 
   */

    trackGatewayMock.getTracks.mockImplementation(async (filter: any) => {
      return trackList.filter((item) => {
        return Object.entries(filter).every(([key, value]) => {
          return item[key] === value;
        });
      });
    });
  });

  /*
    Expected case 
   */

  it('should create a new track and call the TrackGateway', async () => {
    const res = await getTrackByIdUsecase.execute(trackId);

    expect(res).toEqual(trackList[0]);
    expect(trackGatewayMock.getTracks).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : DB fail
   */

  it('should throw if trackGateway.createNewTrack fails', async () => {
    trackGatewayMock.getTracks.mockRejectedValue(new Error('DB error'));
    await expect(getTrackByIdUsecase.execute(trackId)).rejects.toThrow(
      'DB error',
    );
  });

  /*
    Error case : track does not exist
   */

  it('should throw if the track does not exist', async () => {
    await expect(getTrackByIdUsecase.execute('wrong-id')).rejects.toThrow(
      NotFoundException,
    );
  });
});
