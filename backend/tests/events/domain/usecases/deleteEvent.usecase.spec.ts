import { DeleteEventUsecase } from 'src/events/domain/usecases/deleteEvent.usecase';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { EventObject } from 'src/events/domain/event';
import { UserObject } from 'src/users/domain/user';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

describe('DeleteEventUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let deleteEventUsecase: DeleteEventUsecase;
  let s3ClientMock: jest.Mocked<any>;

  /*
    Data Test 
   */
  const eventId = 'test-event-id';
  const creatorId = 'creator-id';
  const creatorEmail = 'email@email.com';
  const userEmail = 'hohoho@gmail.com';
  const tag1 = new TagEntity({
    id: 'tag1-id',
    name: 'tag1',
    videos: [],
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
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

  const deletedEvent: EventObject = new EventObject(
    eventId,
    'Deleted Event',
    'This event has been deleted',
    [tag1],
    new Date(),
    new Date(),
    false,
    false,
    true,
    'image.jpg',
    [],
    'creator-id',
    new Date(),
    creator,
    [],
  );

  beforeEach(() => {
    s3ClientMock = {
      send: jest.fn(),
    };

    eventGatewayMock = {
      createNewEvent: jest.fn(),
      getEvents: jest.fn(),
      updateEvent: jest.fn(),
      deleteEvent: jest.fn(),
      getEventById: jest.fn(),
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

    deleteEventUsecase = new DeleteEventUsecase(
      eventGatewayMock,
      userGatewayMock,
      s3ClientMock,
    );
    /*
    Expected Moke 
   */

    eventGatewayMock.getEventById.mockImplementation(async (id: string) => {
      if (id === eventId) return deletedEvent;
      return null;
    });

    eventGatewayMock.deleteEvent.mockResolvedValue(deletedEvent);

    userGatewayMock.getUserByEmail.mockImplementation(async (email: string) => {
      if (email === creatorEmail) {
        return creator;
      }
      if (email === userEmail) {
        return user;
      }
      return null;
    });
  });

  /*
    Expected case 
   */

  it('should call eventGateway.deleteEvent with the correct eventId and return the deleted event', async () => {
    const result = await deleteEventUsecase.execute(eventId, creatorEmail);

    expect(eventGatewayMock.deleteEvent).toHaveBeenCalledTimes(1);
    expect(result).toEqual(deletedEvent);
  });

  /*
    Error case : DB failed 
   */

  it('should throw an error if eventGateway.deleteEvent fails', async () => {
    eventGatewayMock.deleteEvent.mockRejectedValue(new Error('Delete failed'));

    await expect(
      deleteEventUsecase.execute(eventId, creatorEmail),
    ).rejects.toThrow('Delete failed');
    expect(eventGatewayMock.deleteEvent).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : current event does not exist  
   */

  it('should throw an error if current user does not exist', async () => {
    await expect(
      deleteEventUsecase.execute('wrong-id', creatorEmail),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.deleteEvent).toHaveBeenCalledTimes(0);
  });

  /*
    Error case : current user does not exist  
   */

  it('should throw an error if current user does not exist', async () => {
    await expect(
      deleteEventUsecase.execute(eventId, 'no@email.com'),
    ).rejects.toThrow(NotFoundException);
    expect(eventGatewayMock.deleteEvent).toHaveBeenCalledTimes(0);
  });

  /*
    Error case : current user wasn't the creator    
   */

  it("should throw an error if current user wasn't the creator", async () => {
    await expect(
      deleteEventUsecase.execute(eventId, userEmail),
    ).rejects.toThrow(UnauthorizedException);
    expect(eventGatewayMock.deleteEvent).toHaveBeenCalledTimes(0);
  });
});
