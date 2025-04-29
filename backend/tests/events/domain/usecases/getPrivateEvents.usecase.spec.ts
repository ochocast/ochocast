import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { EventObject } from 'src/events/domain/event';
import { PublicEventObject } from 'src/events/domain/publicEvent';
import { GetPrivateEventsUsecase } from 'src/events/domain/usecases/getPrivateEvents.usecase';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { UserObject } from 'src/users/domain/user';
import { NotFoundException } from '@nestjs/common';

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

  const creator: UserObject = {
    id: creatorId,
    firstName: 'firstname',
    lastName: 'lastname',
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
      ['tag1'],
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
    ),
    new EventObject(
      'event-id-2',
      'Event 2',
      'Description 2',
      ['tag2'],
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
    ),
  ];

  const publicEventList = eventList.map(
    (e) => new PublicEventObject(e, creatorEmail),
  );
  eventList.push(
    new EventObject(
      'event-id-2',
      'Event 2',
      'Description 2',
      ['tag2'],
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
      if (email === creatorEmail) {
        return creator;
      }
      if (email === userEmail) {
        return user;
      }
      if (email === user2Email) {
        return user2;
      }
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
    Expected case : all of our event
   */

  it('should return a list of events from the eventGateway', async () => {
    const result = await getPrivateEventsUsecase.execute(
      { published: false },
      creatorEmail,
    );
    expect(result).toEqual([new PublicEventObject(eventList[0], creatorEmail)]);
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
