import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { EventObject } from 'src/events/domain/event';
import { PublicEventObject } from 'src/events/domain/publicEvent';
import { UserObject } from 'src/users/domain/user';
import { UnsubscribeFromEventUsecase } from 'src/events/domain/usecases/unsubscribeFromEvent.usecase';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';

describe('UnsubscribeFromEventUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let unsubscribeFromEventUsecase: UnsubscribeFromEventUsecase;

  /*
    Data Test
   */
  const eventId = 'test-event-id';
  const userId = 'user-id';
  const userEmail = 'user@email.com';
  const creatorId = 'creator-id';
  const creatorEmail = 'creator@email.com';

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

  const creator: UserObject = {
    id: creatorId,
    firstName: 'creator_first',
    lastName: 'creator_last',
    username: 'creator_username',
    email: creatorEmail,
    role: '',
    description: '...',
    comments: [],
    videos: [],
    events: [],
    videosAsSpeaker: [],
    createdAt: new Date(),
    picture_id: 'creator_picture_id',
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
    creatorId,
    new Date(),
    creator,
    [user], // User is subscribed initially
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

    unsubscribeFromEventUsecase = new UnsubscribeFromEventUsecase(
      eventGatewayMock,
      userGatewayMock,
    );
  });

  describe('execute', () => {
    beforeEach(() => {
      eventGatewayMock.getEventById.mockResolvedValue(event);
      userGatewayMock.getUserByEmail.mockResolvedValue(user);

      // Mock the updateEvent to return the event with the user removed
      const updatedEvent = new EventObject(
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
        creatorId,
        new Date(),
        creator,
        [], // User is no longer subscribed
      );
      eventGatewayMock.updateEvent.mockResolvedValue(updatedEvent);
    });

    it('should return the event with the user unsubscribed', async () => {
      const result = await unsubscribeFromEventUsecase.execute(
        eventId,
        userEmail,
      );

      expect(result.id).toEqual(eventId);
      expect(result.name).toEqual('Event');
      expect(result.nbSubscription).toEqual(0);
      expect(result.subscribedUserIds).not.toContain(userId);
      expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
      expect(userGatewayMock.getUserByEmail).toHaveBeenCalledTimes(1);
      expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(1);
    });

    /*
      Error case: event not found
     */
    it("should throw when event doesn't exist", async () => {
      eventGatewayMock.getEventById.mockResolvedValue(null);

      await expect(
        unsubscribeFromEventUsecase.execute(eventId, userEmail),
      ).rejects.toThrow(NotFoundException);
    });

    /*
      Error case: user not found
     */
    it("should throw when user doesn't exist", async () => {
      userGatewayMock.getUserByEmail.mockResolvedValue(null);

      await expect(
        unsubscribeFromEventUsecase.execute(eventId, userEmail),
      ).rejects.toThrow(NotFoundException);
    });

    /*
      Error case: user not subscribed
     */
    it('should throw when user is not subscribed to the event', async () => {
      const unsubscribedEvent = new EventObject(
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
        creatorId,
        new Date(),
        creator,
        [], // No subscribers
      );
      eventGatewayMock.getEventById.mockResolvedValue(unsubscribedEvent);

      await expect(
        unsubscribeFromEventUsecase.execute(eventId, userEmail),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
