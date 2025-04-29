import { GetEventsUsecase } from 'src/events/domain/usecases/getEvents.usecase';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { EventObject } from 'src/events/domain/event';
import { PublicEventObject } from 'src/events/domain/publicEvent';
import { UserObject } from 'src/users/domain/user';

describe('GetEventsUsecase', () => {
  let eventGatewayMock: jest.Mocked<IEventGateway>;
  let getEventsUsecase: GetEventsUsecase;

  /*
    Data Test 
   */
  //const filter = { published: true };

  const creator: UserObject = {
    id: 'creator-id',
    firstName: 'firstname',
    lastName: 'lastname',
    email: 'coucou@yohan.cava?',
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
      true,
      false,
      false,
      'image1.jpg',
      [],
      'creator-id',
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
      'creator-id',
      new Date(),
      creator,
    ),
  ];

  const publicEventList = eventList.map((e) => new PublicEventObject(e, null));

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
      'creator-id',
      new Date(),
      creator,
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

    getEventsUsecase = new GetEventsUsecase(eventGatewayMock);

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
  });

  /*
    Expected case 
   */

  it('should return a list of events from the eventGateway', async () => {
    const result = await getEventsUsecase.execute({}, null);
    expect(result).toEqual(publicEventList);
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });

  /*
    Expected case : no event find
   */

  it('should return an empty list of events from the eventGateway', async () => {
    eventGatewayMock.getEvents.mockResolvedValue([]);
    const result = await getEventsUsecase.execute({ published: true }, null);
    expect(result).toEqual([]);
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });

  /*
    Error case : DB Error 
   */

  it('should throw an error if eventGateway.getEvents fails', async () => {
    eventGatewayMock.getEvents.mockRejectedValue(new Error('DB Error'));
    await expect(getEventsUsecase.execute({}, null)).rejects.toThrow(
      'DB Error',
    );
    expect(eventGatewayMock.getEvents).toHaveBeenCalledTimes(1);
  });
});
