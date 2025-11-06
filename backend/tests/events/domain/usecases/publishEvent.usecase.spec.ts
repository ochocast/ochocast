import { PublishEventUsecase } from 'src/events/domain/usecases/publishEvent.usecase';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { EventObject } from 'src/events/domain/event';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { UserObject } from 'src/users/domain/user';
import { PublicEventObject } from 'src/events/domain/publicEvent';

describe('PublishEventUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let publishEventUsecase: PublishEventUsecase;

  /*
    Data Test 
   */
  const eventId = 'test-event-id';
  const creatorId = 'creator-id';
  const creatorEmail = 'email@email.com';
  const userEmail = 'hohoho@gmail.com';

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

  const eventPublish = new EventObject(
    eventId,
    event.name,
    event.description,
    event.tags,
    event.startDate,
    event.endDate,
    true,
    event.isPrivate,
    event.closed,
    event.imageSlug,
    event.tracks,
    event.creatorId,
    event.createdAt,
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

    publishEventUsecase = new PublishEventUsecase(
      eventGatewayMock,
      userGatewayMock,
    );

    /*
    Expected Moke 
   */

    userGatewayMock.getUserByEmail.mockImplementation(async (email: string) => {
      if (email === creatorEmail) {
        return creator;
      }
      if (email === userEmail) {
        return user;
      }
      return null;
    });

    eventGatewayMock.getEventById.mockImplementation(async (id: string) => {
      if (id === eventId) {
        return event;
      }
      return null;
    });

    eventGatewayMock.updateEvent.mockImplementation(
      async (event: EventObject) => {
        return event;
      },
    );
  });

  /*
    Expected case 
   */

  it('should publish the event when user is authorized', async () => {
    const result = await publishEventUsecase.execute(eventId, creatorEmail);

    expect(result).toEqual(new PublicEventObject(eventPublish, creator));
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : DB Error 
   */

  it('should throw an error if eventGateway.updateEvent fails', async () => {
    eventGatewayMock.updateEvent.mockRejectedValue(new Error('Update failed'));

    await expect(
      publishEventUsecase.execute(eventId, creatorEmail),
    ).rejects.toThrow('Update failed');
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : Event does not exist 
   */

  it('should throw an error if Event does not exist', async () => {
    await expect(
      publishEventUsecase.execute('wrong event id', creatorEmail),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(0);
  });

  /*
    Error case : Current user does not exist 
   */

  it('should throw an error if Current user does not exist', async () => {
    await expect(
      publishEventUsecase.execute(eventId, 'wrong@email.com'),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(0);
  });

  /*
    Error case : Current user does not have the right to publish the event 
   */

  it('should throw an error if Current user does not have the right to publish the event', async () => {
    await expect(
      publishEventUsecase.execute(eventId, userEmail),
    ).rejects.toThrow(UnauthorizedException);
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(0);
  });
});
