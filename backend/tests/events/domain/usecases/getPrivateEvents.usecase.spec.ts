import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { EventObject } from 'src/events/domain/event';
import { PublicEventObject } from 'src/events/domain/publicEvent';
import { GetPrivateEventsUsecase } from 'src/events/domain/usecases/getPrivateEvents.usecase';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';
import { NotFoundException } from '@nestjs/common';
import { TrackObject } from 'src/tracks/domain/track';
import { PublicUserObject } from 'src/users/domain/publicUser';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

describe('GetPrivateEventsUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let getPrivateEventsUsecase: GetPrivateEventsUsecase;
  /*
    Data Test 
   */
  const creatorId = 'creator-id';
  const creatorEmail = 'email@email.com';
  const userEmail = 'hohoho@gmail.com';
  const user2Email = 'hahaha@gmail.com';
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
    id: creatorId,
    firstName: 'firstname',
    lastName: 'lastname',
    username: 'Username',
    email: creatorEmail,
    role: '',
    description: '...',
    comments: [],
    videos: [],
    events: [],
    videosAsSpeaker: [],
    createdAt: new Date(),
    picture_id: 'picture_id',
  };

  const speakerEmail = 'speaker@test.com';

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
    picture_id: 'pic',
  };

  const speakerPublic = new PublicUserObject(speaker);

  const speakerTrack = new TrackObject(
    'track-id-1',
    'Track for Speaker',
    'Description',
    ['tag'],
    'stream-key',
    false,
    'event-id-speaker',
    new Date(),
    new Date(),
    new Date(),
    [speakerPublic],
    undefined,
  );

  const speakerEvent = new EventObject(
    'event-id-speaker',
    'Event for Speaker',
    'Desc',
    [tag1],
    new Date(),
    new Date(),
    false, // non publié
    false,
    false,
    'image.jpg',
    [speakerTrack],
    'creator-id',
    new Date(),
    creator,
    [],
  );

  const user: UserObject = {
    id: 'an-other-id',
    firstName: 'firstname',
    lastName: 'lastname',
    username: 'Username',
    email: userEmail,
    role: '',
    description: '...',
    comments: [],
    videos: [],
    events: [],
    videosAsSpeaker: [],
    createdAt: new Date(),
    picture_id: 'picture_id',
  };

  const user2: UserObject = {
    id: 'an-other-id2',
    firstName: 'firstname',
    lastName: 'lastname',
    username: 'Username',
    email: user2Email,
    role: '',
    description: '...',
    comments: [],
    videos: [],
    events: [],
    videosAsSpeaker: [],
    createdAt: new Date(),
    picture_id: 'picture_id',
  };

  const eventList: EventObject[] = [
    new EventObject(
      'event-id-1',
      'Event 1',
      'Description 1',
      [tag2],
      new Date(),
      new Date(),
      false,
      false,
      false,
      'image1.jpg',
      [],
      creatorId,
      new Date(),
      creator,
      [],
    ),
    new EventObject(
      'event-id-2',
      'Event 2',
      'Description 2',
      [tag3],
      new Date(),
      new Date(),
      true,
      false,
      false,
      'image2.jpg',
      [],
      creatorId,
      new Date(),
      creator,
      [],
    ),
  ];

  eventList.push(speakerEvent);

  const publicEventList = eventList.map(
    (e) => new PublicEventObject(e, creator),
  );
  eventList.push(
    new EventObject(
      'event-id-2',
      'Event 2',
      'Description 2',
      [tag3],
      new Date(),
      new Date(),
      false,
      false,
      false,
      'image2.jpg',
      [],
      user.id,
      new Date(),
      user,
      [],
    ),
  );

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

    getPrivateEventsUsecase = new GetPrivateEventsUsecase(
      eventGatewayMock,
      userGatewayMock,
    );

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
      if (email === userEmail) return user;
      if (email === user2Email) return user2;
      if (email === speakerEmail) return speaker;
      return null;
    });
  });

  /*
    Expected case : all of our event
   */

  it('should return a list of events from the eventGateway', async () => {
    const result = await getPrivateEventsUsecase.execute({}, creatorEmail);
    expect(result).toEqual(publicEventList);
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });

  /*
    Expected case : all of our not published event
   */

  it('should return a list of not published events from the eventGateway', async () => {
    const result = await getPrivateEventsUsecase.execute(
      { published: false },
      creatorEmail,
    );
    expect(result).toEqual([
      new PublicEventObject(eventList[0], creator),
      new PublicEventObject(eventList[2], creator),
    ]);
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });

  /*
    Expected case : no event find
   */

  it('should return a list of events from the eventGateway', async () => {
    const result = await getPrivateEventsUsecase.execute(
      { published: false },
      user2Email,
    );
    expect(result).toEqual([]);
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });

  /*
    Expected case : editable private events for a speaker 
   */

  it('should return editable private events for a speaker (not creator)', async () => {
    const result = await getPrivateEventsUsecase.execute(
      { published: false },
      speakerEmail,
    );

    // On s’attend à ce que l’événement de l’orateur soit retourné
    expect(result).toEqual([new PublicEventObject(eventList[2], speaker)]);
    expect(result[0].canBeEditByUser).toEqual(true);

    // const speakerEventResult = result.find((e) => e.id === 'event-id-speaker');
    // expect(speakerEventResult).toBeDefined();
    // expect(speakerEventResult.canBeEditByUser).toBe(true);
  });

  /*
    Error case : DB Error 
   */

  it('should throw an error if eventGateway.getEvents fails', async () => {
    eventGatewayMock.getEvents.mockRejectedValue(new Error('DB Error'));
    await expect(
      getPrivateEventsUsecase.execute({}, creatorEmail),
    ).rejects.toThrow('DB Error');
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : User not found 
   */
  it('should throw an error if User not found', async () => {
    await expect(
      getPrivateEventsUsecase.execute({}, 'notAUser@pas.cool'),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(0);
  });
});
