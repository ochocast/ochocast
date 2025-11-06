import { NotFoundException } from '@nestjs/common';
import { EventObject } from 'src/events/domain/event';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { PublicEventObject } from 'src/events/domain/publicEvent';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
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
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  /*
    Data Test 
   */

  const now = new Date();
  const eventId = 'event-123';
  const validSpeakerId = 'speaker-1';
  const otherSpeakerId = 'speaker-2';
  const trackId = 'idtrack1';
  const trackId2 = 'idtrack2';
  const tag1 = new TagEntity({
    id: 'tag1-id',
    name: 'tag1',
    videos: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  });

  const mockUser: UserObject = {
    id: validSpeakerId,
    firstName: 'Alice',
    lastName: 'Smith',
    username: 'ASmith',
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
    username: 'BSmith',
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
    [tag1],
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
      new PublicEventObject(mockEvent, null),
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
      new PublicEventObject(mockEvent, null),
    ),
  ];

  beforeEach(() => {
    trackGatewayMock = {
      createNewTrack: jest.fn(),
      getTracks: jest.fn(),
      updateTrack: jest.fn(),
      deleteTrack: jest.fn(),
    };

    eventGatewayMock = {
      createNewEvent: jest.fn(),
      getEvents: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getEventById: jest.fn(),
    };

    getTrackByIdUsecase = new GetTrackByIdUsecase(
      trackGatewayMock,
      eventGatewayMock,
    );

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

    eventGatewayMock.getEventById.mockImplementation(async (id: string) => {
      if (id === eventId) return mockEvent;
      return null;
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
