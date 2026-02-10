import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventObject } from 'src/events/domain/event';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { TrackObject } from 'src/tracks/domain/track';
import { DeleteTrackUsecase } from 'src/tracks/domain/usecases/deleteTrack.usecase';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

describe('DeleteTracktUsecase', () => {
  let deleteTrackUseCase: DeleteTrackUsecase;
  let trackGatewayMock: jest.Mocked<ITrackGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
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
    firstName: 'bob',
    lastName: 'Smith',
    username: 'BSmith',
    email: 'bob@example.com',
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
      eventId,
      now,
      now,
      now,
      [mockUser],
      undefined,
    ),
    new TrackObject(
      trackId2,
      'name2',
      'desc2',
      [],
      'key2',
      false,
      eventId,
      now,
      now,
      now,
      [mockUser2],
      undefined,
    ),
  ];

  beforeEach(() => {
    trackGatewayMock = {
      createNewTrack: jest.fn(),
      getTracks: jest.fn(),
      updateTrack: jest.fn(),
      deleteTrack: jest.fn(),
    };

    userGatewayMock = {
      getListUsers: jest.fn(),
      createNewUser: jest.fn(),
      getUsers: jest.fn(),
      loginUser: jest.fn(),
      getUserByEmail: jest.fn(),
      getUserById: jest.fn(),
      addFavoriteVideo: jest.fn(),
      removeFavoriteVideo: jest.fn(),
      isVideoFavorite: jest.fn(),
      getFavoriteVideos: jest.fn(),
      updateUserProfile: jest.fn(),
      addLikedComment: jest.fn(),
      removeLikedComment: jest.fn(),
      getLikedComment: jest.fn(),
    };

    eventGatewayMock = {
      createNewEvent: jest.fn(),
      getEvents: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getEventById: jest.fn(),
    };

    deleteTrackUseCase = new DeleteTrackUsecase(
      trackGatewayMock,
      userGatewayMock,
      eventGatewayMock,
    );

    /*
    Expected Moke 
   */

    userGatewayMock.getUserByEmail.mockImplementation(async (email: string) => {
      if (email === mockUser.email) return mockUser;
      if (email === mockUser2.email) return mockUser2;
      return null;
    });

    userGatewayMock.getUserById.mockImplementation(async (id: string) => {
      if (id === mockUser.id) return mockUser;
      if (id === otherSpeakerId) return mockUser2;
      return null;
    });

    eventGatewayMock.getEventById.mockImplementation(async (id: string) => {
      if (id === mockEvent.id) return mockEvent;
      return null;
    });

    trackGatewayMock.getTracks.mockImplementation(async (filter: any) => {
      return trackList.filter((item) => {
        return Object.entries(filter).every(([key, value]) => {
          return item[key] === value;
        });
      });
    });

    trackGatewayMock.deleteTrack.mockImplementation(async (id: string) => {
      return trackList.filter((item) => {
        return Object.entries({ id: id }).every(([key, value]) => {
          return item[key] === value;
        });
      })[0];
    });
  });

  /*
    Expected case 
   */

  it('should create a new track and call the TrackGateway', async () => {
    const res = await deleteTrackUseCase.execute(trackId, mockUser.email);

    expect(res).toEqual(trackList[0]);
    expect(trackGatewayMock.deleteTrack).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : DB fail
   */

  it('should throw if trackGateway.deleteTrack fails', async () => {
    trackGatewayMock.deleteTrack.mockRejectedValue(new Error('DB error'));
    await expect(
      deleteTrackUseCase.execute(trackId, mockUser.email),
    ).rejects.toThrow('DB error');
  });

  /*
    Error case : track does not exist
   */

  it('should throw if the track does not exist', async () => {
    await expect(
      deleteTrackUseCase.execute('wrong-id', mockUser.email),
    ).rejects.toThrow(NotFoundException);
  });

  /*
    Error case : current user does not exist
   */

  it('should throw if the current user does not exist', async () => {
    await expect(
      deleteTrackUseCase.execute(trackId, 'wrong@email.com'),
    ).rejects.toThrow(NotFoundException);
  });

  /*
    Error case : current user does not have acces update track
   */

  it('should throw if the current user does not have acces update track', async () => {
    await expect(
      deleteTrackUseCase.execute(trackId, mockUser2.email),
    ).rejects.toThrow(UnauthorizedException);
  });
});
