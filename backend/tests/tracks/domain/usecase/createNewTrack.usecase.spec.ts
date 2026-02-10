import { NotFoundException } from '@nestjs/common';
import { EventObject } from 'src/events/domain/event';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { TrackObject } from 'src/tracks/domain/track';
import { CreateNewTrackUsecase } from 'src/tracks/domain/usecases/createNewTrack.usecase';
import { TrackDto } from 'src/tracks/infra/controllers/dto/track.dto';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

describe('CreateNewTracktUsecase', () => {
  let createNewTrackUseCase: CreateNewTrackUsecase;
  let trackGatewayMock: jest.Mocked<ITrackGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let eventGatewayMock: jest.Mocked<IEventGateway>;

  /*
    Data Test 
   */

  const now = new Date();
  const eventId = 'event-123';
  const validSpeakerId = 'speaker-1';
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

  const trackDto: TrackDto = {
    name: 'Main Track',
    description: 'Main stage track',
    keywords: ['main', 'track'],
    startDate: now,
    endDate: now,
    eventId: eventId,
    speakers: [validSpeakerId],
  };

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

    createNewTrackUseCase = new CreateNewTrackUsecase(
      trackGatewayMock,
      userGatewayMock,
      eventGatewayMock,
    );

    /*
    Expected Moke 
   */

    userGatewayMock.getUserById.mockImplementation(async (id: string) => {
      if (id === mockUser.id) return mockUser;
      return null;
    });

    eventGatewayMock.getEventById.mockImplementation(async (id: string) => {
      if (id === mockEvent.id) return mockEvent;
      return null;
    });

    trackGatewayMock.createNewTrack.mockImplementation(
      async (e: TrackObject) => e,
    );
  });

  /*
    Expected case 
   */

  it('should create a new track and call the TrackGateway', async () => {
    const res = await createNewTrackUseCase.execute(trackDto);

    expect(res).toBeInstanceOf(TrackObject);
    expect(userGatewayMock.getUserById).toHaveBeenCalledTimes(1);
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
    expect(trackGatewayMock.createNewTrack).toHaveBeenCalledTimes(1);
    expect(res.name).toEqual(trackDto.name);
    expect(res.description).toEqual(trackDto.description);
    expect(res.keywords).toEqual(trackDto.keywords);
    expect(res.startDate).toEqual(trackDto.startDate);
    expect(res.endDate).toEqual(trackDto.endDate);
    expect(res.eventId).toEqual(trackDto.eventId);
    expect(res.speakers).toEqual([mockUser]);
  });

  /*
    Error case : DB fail
   */

  it('should throw if trackGateway.createNewTrack fails', async () => {
    trackGatewayMock.createNewTrack.mockRejectedValue(new Error('DB error'));
    await expect(createNewTrackUseCase.execute(trackDto)).rejects.toThrow(
      'DB error',
    );
  });

  /*
    Error case : a speaker does not exist
   */

  it('should throw if a speaker does not exist', async () => {
    await expect(
      createNewTrackUseCase.execute({
        name: 'T2',
        description: 'D2',
        keywords: [],
        startDate: now,
        endDate: now,
        eventId,
        speakers: ['wrond-id'],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  /*
    Error case : event does not exist
   */

  it('should throw if the event does not exist', async () => {
    await expect(
      createNewTrackUseCase.execute({
        name: 'T3',
        description: 'D3',
        keywords: [],
        startDate: now,
        endDate: now,
        eventId: 'wrong-id',
        speakers: [validSpeakerId],
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
