import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { EventObject } from 'src/events/domain/event';
import { PublicEventObject } from 'src/events/domain/publicEvent';
import { UserObject } from 'src/users/domain/user';
import { SubscribeToEventUsecase } from 'src/events/domain/usecases/subscribeToEvent.usecase';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
// import { NotFoundException } from '@nestjs/common';

describe('SubcribeToEventUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let subscribeToEventUsecase: SubscribeToEventUsecase;

  /*
    Data Test 
   */
  const eventId = 'test-event-id';
  const eventNotPubId = 'other-id';
  const userId = 'user-id';
  const userEmail = 'user@email.com';

  const user: UserObject = {
    id: userId,
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
    true,
    false,
    false,
    'image.jpg',
    [],
    'creator-id',
    new Date(),
    {
      id: 'creator-id',
      firstName: 'cou',
      lastName: 'cou',
      username: 'Username',
      email: 'email',
      role: '',
      description: '...',
      comments: [],
      videos: [],
      events: [],
      videosAsSpeaker: [],
      createdAt: new Date(),
      picture_id: 'picture_id',
    },
    [],
  );

  const eventNotPublish = new EventObject(
    eventNotPubId,
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
    'creator-id',
    new Date(),
    {
      id: 'creator-id',
      firstName: 'cou',
      lastName: 'cou',
      username: 'Username',
      email: 'email',
      role: '',
      description: '...',
      comments: [],
      videos: [],
      events: [],
      videosAsSpeaker: [],
      createdAt: new Date(),
      picture_id: 'picture_id',
    },
    [],
  );
  const publicEvent = new PublicEventObject(event, null);

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

    subscribeToEventUsecase = new SubscribeToEventUsecase(
      eventGatewayMock,
      userGatewayMock,
    );

    /*
    Expected Moke 
   */

    userGatewayMock.getUserByEmail.mockImplementation(async (email: string) => {
      if (email === userEmail) return user;
      return null;
    });

    eventGatewayMock.getEventById.mockImplementation(async (id: string) => {
      if (id === eventId) return event;
      if (id === eventNotPubId) return eventNotPublish;
      return null;
    });

    eventGatewayMock.updateEvent.mockImplementation(
      async (event: EventObject) => {
        return event;
      },
    );
  });

  /*
    Expected case add a user subscription to event
   */

  it('should return a the event with the user subscribe', async () => {
    const result = await subscribeToEventUsecase.execute(eventId, userEmail);

    expect(result.id).toEqual(eventId);
    expect(result.name).toEqual('Event');
    expect(result.nbSubscription).toEqual(1);
    expect(result.subscribedUserIds).toContain(userId);
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
    expect(userGatewayMock.getUserByEmail).toHaveBeenCalledTimes(1);
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : event not publish
   */

  it('should throw an error when event is not pusblish', async () => {
    await expect(
      subscribeToEventUsecase.execute(eventNotPubId, userEmail),
    ).rejects.toThrow(UnauthorizedException);
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : user not find
   */

  it('should throw an error when user is not find', async () => {
    await expect(
      subscribeToEventUsecase.execute(eventId, 'not a good email'),
    ).rejects.toThrow(NotFoundException);
    expect(userGatewayMock.getUserByEmail).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : no event find
   */

  it('should throw an error when event is not find', async () => {
    await expect(
      subscribeToEventUsecase.execute('not an event id', userEmail),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : DB Error 
   */

  it('should throw an error if eventGateway.updateEvent fails', async () => {
    event.usersSubscribe = [];
    eventGatewayMock.updateEvent.mockRejectedValue(new Error('DB Error'));
    await expect(
      subscribeToEventUsecase.execute(eventId, userEmail),
    ).rejects.toThrow('DB Error');
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(1);
  });
});
