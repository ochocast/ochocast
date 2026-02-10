import { CloseEventUsecase } from 'src/events/domain/usecases/closeEvent.usecase';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { EventObject } from 'src/events/domain/event';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { UserObject } from 'src/users/domain/user';

describe('CloseEventUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let closeEventUsecase: CloseEventUsecase;

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

  const eventClose = new EventObject(
    eventId,
    event.name,
    event.description,
    event.tags,
    event.startDate,
    event.endDate,
    event.published,
    event.isPrivate,
    true,
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

    closeEventUsecase = new CloseEventUsecase(
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

  it('should close the event when user is authorized', async () => {
    const result = await closeEventUsecase.execute(eventId, creatorEmail);

    expect(result).toEqual(eventClose);
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : DB Error 
   */

  it('should throw an error if eventGateway.updateEvent fails', async () => {
    eventGatewayMock.updateEvent.mockRejectedValue(new Error('Update failed'));

    await expect(
      closeEventUsecase.execute(eventId, creatorEmail),
    ).rejects.toThrow('Update failed');
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : Event does not exist 
   */

  it('should throw an error if Event does not exist', async () => {
    await expect(
      closeEventUsecase.execute('wrong event id', creatorEmail),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(0);
  });

  /*
    Error case : Current user does not exist 
   */

  it('should throw an error if Current user does not exist', async () => {
    await expect(
      closeEventUsecase.execute(eventId, 'wrong@email.com'),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(0);
  });

  /*
    Error case : Current user does not have the right to close the event 
   */

  it('should throw an error if Current user does not have the right to close the event', async () => {
    await expect(closeEventUsecase.execute(eventId, userEmail)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(eventGatewayMock.updateEvent).toHaveBeenCalledTimes(0);
  });
});
