import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { EventObject } from 'src/events/domain/event';
import { PublicEventObject } from 'src/events/domain/publicEvent';
import { UserObject } from 'src/users/domain/user';
import { GetEventByIdUsecase } from 'src/events/domain/usecases/getEventById.usecase';
import { NotFoundException } from '@nestjs/common';

describe('GetEventByIdUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let getEventByIdUsecase: GetEventByIdUsecase;

  /*
    Data Test 
   */
  const eventId = 'test-event-id';
  const creatorId = 'creator-id';

  const creator: UserObject = {
    id: creatorId,
    firstName: 'firstname',
    lastName: 'lastname',
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
  };

  const event = new EventObject(
    eventId,
    'Event',
    'Description',
    [],
    new Date('2024-05-01T10:00:00Z'),
    new Date('2024-05-01T12:00:00Z'),
    true, // published: true for public access
    false,
    false,
    'image.jpg',
    [],
    creatorId,
    new Date(),
    creator,
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

    getEventByIdUsecase = new GetEventByIdUsecase(eventGatewayMock);

    /*
    Expected Moke 
   */

    eventGatewayMock.getEventById.mockImplementation(async (id: string) => {
      if (id === eventId) {
        return event;
      }
      return null;
    });
  });

  /*
    Expected case 
   */

  it('should return a list of events from the eventGateway', async () => {
    const result = await getEventByIdUsecase.execute(eventId);
    expect(result).toEqual(publicEvent);
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : no event find
   */

  it('should return an empty list of events from the eventGateway', async () => {
    await expect(getEventByIdUsecase.execute('wrong event id')).rejects.toThrow(
      NotFoundException,
    );
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : DB Error 
   */

  it('should throw an error if eventGateway.getEvents fails', async () => {
    eventGatewayMock.getEventById.mockRejectedValue(new Error('DB Error'));
    await expect(getEventByIdUsecase.execute(eventId)).rejects.toThrow(
      'DB Error',
    );
    expect(eventGatewayMock.getEventById).toHaveBeenCalledTimes(1);
  });
});
