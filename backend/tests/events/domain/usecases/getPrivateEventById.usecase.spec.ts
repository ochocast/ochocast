import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { EventObject } from 'src/events/domain/event';
import { UserObject } from 'src/users/domain/user';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { GetPrivateEventByIdUsecase } from 'src/events/domain/usecases/getPrivateEventById.usecase';
import { TrackObject } from 'src/tracks/domain/track';
import { PublicUserObject } from 'src/users/domain/publicUser';

describe('GetPrivateEventByIdUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let getPrivateEventByIdUsecase: GetPrivateEventByIdUsecase;

  /*
    Data Test 
   */
  const eventId = 'test-event-id';
  const creatorId = 'creator-id';
  const creatorEmail = 'email@email.com';
  const userEmail = 'hohoho@gmail.com';
  const speakerEmail = 'speaker@email.com';
  const eventSpeakerId = 'test-speaker-event-id';

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

  const speaker: UserObject = {
    id: 'speaker-id',
    firstName: 'Speaker',
    lastName: 'Lastname',
    username: 'Username',
    email: speakerEmail,
    role: '',
    description: '...',
    comments: [],
    videos: [],
    events: [],
    videosAsSpeaker: [],
    createdAt: new Date(),
    picture_id: 'picture_id',
  };

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

  const event = new EventObject(
    eventId,
    'Event',
    'Description',
    [],
    new Date('2024-05-01T10:00:00Z'),
    new Date('2024-05-01T12:00:00Z'),
    false,
    false,
    false,
    'image.jpg',
    [],
    creatorId,
    new Date(),
    creator,
    [],
  );

  const speakerTrack = new TrackObject(
    'track-id',
    'Track Name',
    'Track Description',
    ['tag1'],
    'stream-key-123',
    false,
    eventId,
    new Date(),
    new Date(),
    new Date(),
    [new PublicUserObject(speaker)],
    undefined,
  );

  const speakerEvent = new EventObject(
    eventSpeakerId,
    'Speaker Event',
    'An event where speaker is not the creator',
    [],
    new Date(),
    new Date(),
    false,
    false,
    false,
    'image.jpg',
    [speakerTrack],
    creatorId, // creator is still someone else
    new Date(),
    creator,
    [],
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
    getPrivateEventByIdUsecase = new GetPrivateEventByIdUsecase(
      eventGatewayMock,
      userGatewayMock,
    );

    /*
    Expected Moke 
   */

    userGatewayMock.getUserByEmail.mockImplementation(async (email: string) => {
      if (email === creatorEmail) return creator;
      if (email === userEmail) return user;
      if (email === speakerEmail) return speaker;
      return null;
    });

    eventGatewayMock.getEventById.mockImplementation(async (id: string) => {
      if (id === eventId) return event;
      if (id === eventSpeakerId) return speakerEvent;
      return null;
    });
  });

  /*
    Expected case 
   */

  it('should return a list of events from the eventGateway', async () => {
    const result = await getPrivateEventByIdUsecase.execute(
      eventId,
      creatorEmail,
    );
    expect(result).toEqual(event);
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
  });

  /*
    Expected case 
   */

  it('should return the event if current user is a speaker on one of the tracks', async () => {
    const result = await getPrivateEventByIdUsecase.execute(
      eventSpeakerId,
      speakerEmail,
    );
    expect(result).toEqual(speakerEvent);
  });

  /*
    Error case : no event find
   */

  it('should return an empty list of events from the eventGateway', async () => {
    await expect(
      getPrivateEventByIdUsecase.execute('wrong event id', creatorEmail),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : DB Error 
   */

  it('should throw an error if eventGateway.getEvents fails', async () => {
    eventGatewayMock.getEventById.mockRejectedValue(new Error('DB Error'));
    await expect(
      getPrivateEventByIdUsecase.execute(eventId, creatorEmail),
    ).rejects.toThrow('DB Error');
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
  });

  /*
      Error case : current user wasn't the creator    
   */

  it("should throw an error if current user wasn't the creator", async () => {
    await expect(
      getPrivateEventByIdUsecase.execute(eventId, userEmail),
    ).rejects.toThrow(UnauthorizedException);
    expect(eventGatewayMock.deleteEvent).toHaveBeenCalledTimes(0);
  });

  /*
      Error case : current user does not exist    
   */

  it("should throw an error if current user wasn't the creator", async () => {
    await expect(
      getPrivateEventByIdUsecase.execute(eventId, 'wrong-user@email.com'),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.deleteEvent).toHaveBeenCalledTimes(0);
  });
});
