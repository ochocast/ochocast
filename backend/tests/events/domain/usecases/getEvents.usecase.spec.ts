import { GetEventsUsecase } from 'src/events/domain/usecases/getEvents.usecase';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { EventObject } from 'src/events/domain/event';
import { PublicEventObject } from 'src/events/domain/publicEvent';
import { UserObject } from 'src/users/domain/user';
import { PublicUserObject } from 'src/users/domain/publicUser';
import { TrackObject } from 'src/tracks/domain/track';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

describe('GetEventsUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let getEventsUsecase: GetEventsUsecase;

  /*
    Data Test 
   */
  const creatorEmail = 'creator@example.com';
  const speakerEmail = 'speaker@example.com';
  const tag1 = new TagEntity({
    id: 'tag1-id',
    name: 'tag1',
    videos: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  });
  const tag2 = new TagEntity({
    id: 'tag2-id',
    name: 'tag2',
    videos: [],
    createdAt: new Date('2025-01-02T00:00:00Z'),
    updatedAt: new Date('2025-01-02T00:00:00Z'),
  });

  const tag3 = new TagEntity({
    id: 'tag3-id',
    name: 'tag3',
    videos: [],
    createdAt: new Date('2025-01-03T00:00:00Z'),
    updatedAt: new Date('2025-01-03T00:00:00Z'),
  });

  const creator: UserObject = {
    id: 'creator-id',
    firstName: 'Creator',
    lastName: 'User',
    username: 'Username',
    email: creatorEmail,
    role: '',
    description: '',
    comments: [],
    videos: [],
    events: [],
    videosAsSpeaker: [],
    createdAt: new Date(),
    picture_id: '',
  };

  const speaker: UserObject = {
    id: 'speaker-id',
    firstName: 'Speaker',
    lastName: 'User',
    username: 'Username',
    email: speakerEmail,
    role: '',
    description: '',
    comments: [],
    videos: [],
    events: [],
    videosAsSpeaker: [],
    createdAt: new Date(),
    picture_id: '',
  };

  const speaker_pub = new PublicUserObject(speaker);

  const sampleTrack = new TrackObject(
    'track-id',
    'Track 1',
    'Description',
    ['tag'],
    'stream-key',
    false,
    'event-id-3',
    new Date(),
    new Date(),
    new Date(),
    [speaker_pub],
    undefined,
  );

  const eventList: EventObject[] = [
    new EventObject(
      'event-id-1',
      'Event 1',
      'Desc',
      [tag1],
      new Date(),
      new Date(),
      true,
      false,
      false,
      'image.jpg',
      [], // no speakers
      'creator-id',
      new Date(),
      creator,
      [],
    ),
    new EventObject(
      'event-id-2',
      'Event 2',
      'Desc',
      [tag2],
      new Date(),
      new Date(),
      true,
      false,
      false,
      'image.jpg',
      [], // no speakers
      'creator-id',
      new Date(),
      creator,
      [],
    ),
    new EventObject(
      'event-id-3',
      'Event 3',
      'Desc',
      [tag3],
      new Date(),
      new Date(),
      true,
      false,
      false,
      'image.jpg',
      [sampleTrack], // has speaker
      'creator-id',
      new Date(),
      creator,
      [],
    ),
  ];

  beforeEach(() => {
    eventGatewayMock = {
      createNewEvent: jest.fn(),
      getEvents: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getEventById: jest.fn(),
    };

    userGatewayMock = {
      getUserByEmail: jest.fn(),
      createNewUser: jest.fn(),
      getUsers: jest.fn(),
      getUserById: jest.fn(),
      loginUser: jest.fn(),
      getListUsers: jest.fn(),
      addFavoriteVideo: jest.fn(),
      removeFavoriteVideo: jest.fn(),
      isVideoFavorite: jest.fn(),
      getFavoriteVideos: jest.fn(),
      updateUserProfile: jest.fn(),
      addLikedComment: jest.fn(),
      removeLikedComment: jest.fn(),
      getLikedComment: jest.fn(),
    };

    getEventsUsecase = new GetEventsUsecase(eventGatewayMock, userGatewayMock);

    /*
      Expected Moke 
     */

    eventGatewayMock.getEvents.mockImplementation(async (filter: any) => {
      return eventList.filter((item) => {
        return Object.entries(filter).every(([key, value]) => {
          return item[key] === value;
        });
      });
    });

    userGatewayMock.getUserByEmail.mockImplementation(async (email: string) => {
      if (email === creatorEmail) return creator;
      if (email === speakerEmail) return speaker;
      return null;
    });
  });

  /*
    Expected case 
   */

  it('should return a list of events from the eventGateway', async () => {
    const result = await getEventsUsecase.execute({}, null);
    expect(result).toEqual(
      eventList.map((e) => new PublicEventObject(e, null)),
    );
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });

  /*
    Expected case : no event find
   */

  it('should return an empty list of events from the eventGateway', async () => {
    eventGatewayMock.getEvents.mockResolvedValue([]);
    const result = await getEventsUsecase.execute({ published: true }, null);
    expect(result).toEqual([]);
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });

  /*
    Expected case : canBeEditByUser=true when current email matches creator
   */

  it('should set canBeEditByUser=true when current email matches creator', async () => {
    const result = await getEventsUsecase.execute({}, creatorEmail);
    expect(result.every((e) => e.canBeEditByUser)).toBe(true);
  });

  /*
    Expected case : canBeEditByUser=true for speaker of a track
   */

  it('should set canBeEditByUser=true for speaker of a track', async () => {
    const result = await getEventsUsecase.execute({}, speakerEmail);
    const speakerEditable = result.find((e) => e.id === 'event-id-3');
    expect(speakerEditable?.canBeEditByUser).toBe(true);
  });

  /*
    Expected case : canBeEditByUser=false for unknown email
   */
  it('should set canBeEditByUser=false for unknown email', async () => {
    const result = await getEventsUsecase.execute({}, 'unknown@example.com');
    expect(result.every((e) => !e.canBeEditByUser)).toBe(true);
  });

  /*
    Expected case : canBeEditByUser=false when email is null
   */
  it('should set canBeEditByUser=false when email is null', async () => {
    const result = await getEventsUsecase.execute({}, null);
    expect(result.every((e) => !e.canBeEditByUser)).toBe(true);
  });

  /*
    Error case : DB Error 
   */

  it('should throw an error if eventGateway.getEvents fails', async () => {
    eventGatewayMock.getEvents.mockRejectedValue(new Error('DB Error'));
    await expect(getEventsUsecase.execute({}, null)).rejects.toThrow(
      'DB Error',
    );
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });
});
