import { CreateNewEventUsecase } from '../../../../src/events/domain/usecases/createNewEvent.usecase';
import { IEventGateway } from '../../../../src/events/domain/gateways/events.gateway';
import { EventDataDto } from '../../../../src/events/infra/controllers/dto/event-data.dto';
import { EventObject } from 'src/events/domain/event';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';
import { NotFoundException } from '@nestjs/common';
import { TagEntity } from 'src/tags/infra/gateways/entities/tag.entity';

jest.mock('uuid', () => ({
  v4: () => 'mock-uuid',
}));

describe('CreateNewEventUsecase', () => {
  let createNewEventUsecase: CreateNewEventUsecase;
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let userGatewayMock: jest.Mocked<IUserGateway>;
  let s3ClientMock: jest.Mocked<any>;

  /*
    Data Test 
   */

  const creatorId = 'creator-id';

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

  const createEventDto: EventDataDto = {
    name: 'Test Event',
    description: 'An event for testing',
    tags: [tag1, tag2],
    startDate: new Date('2025-05-01T10:00:00Z'),
    endDate: new Date('2025-05-01T12:00:00Z'),
    imageSlug: 'imageSlug',
    miniature: new File([], 'imageSlug.jpg'),
  };

  const creator: UserObject = {
    id: creatorId,
    firstName: 'firstname',
    lastName: 'lastname',
    username: 'Username',
    email: 'email@email.com',
    role: '',
    description: '...',
    comments: [],
    videos: [],
    events: [],
    videosAsSpeaker: [],
    createdAt: new Date(),
    picture_id: 'picture_id',
  };

  beforeEach(() => {
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

    createNewEventUsecase = new CreateNewEventUsecase(
      eventGatewayMock,
      userGatewayMock,
      s3ClientMock,
    );

    /*
    Expected Moke 
   */

    userGatewayMock.getUserByEmail.mockImplementation(async (email: string) => {
      if (email === creator.email) {
        return creator;
      }
      return null;
    });
  });

  /*
    Expected case 
   */

  it('should create a new event and call the eventGateway', async () => {
    const createdEvent = await createNewEventUsecase.execute(
      creator.email,
      createEventDto,
      null,
    );

    expect(createdEvent).toBeInstanceOf(EventObject);
    expect(createdEvent.id).toBe('mock-uuid');
    expect(createdEvent.name).toBe('Test Event');
    expect(createdEvent.description).toBe('An event for testing');
    expect(createdEvent.tags).toEqual([tag1, tag2]);
    expect(createdEvent.startDate).toEqual(new Date('2025-05-01T10:00:00Z'));
    expect(createdEvent.endDate).toEqual(new Date('2025-05-01T12:00:00Z'));
    expect(createdEvent.isPrivate).toBe(true);
    expect(createdEvent.imageSlug).toBe('imageSlug');
    expect(createdEvent.createdAt).toBeInstanceOf(Date);
    expect(createdEvent.creatorId).toEqual(creatorId);

    expect(eventGatewayMock.createNewEvent).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : DB fail
   */

  it('should throw if eventGateway.createNewEvent fails', async () => {
    eventGatewayMock.createNewEvent.mockRejectedValue(
      new Error('Database error'),
    );

    await expect(
      createNewEventUsecase.execute(creator.email, createEventDto, null),
    ).rejects.toThrow('Database error');

    expect(eventGatewayMock.createNewEvent).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : creator does not exist
   */

  it('should throw if eventGateway.createNewEvent fails', async () => {
    await expect(
      createNewEventUsecase.execute('not@email.com', createEventDto, null),
    ).rejects.toThrow(NotFoundException);

    expect(eventGatewayMock.createNewEvent).toHaveBeenCalledTimes(0);
  });
});
