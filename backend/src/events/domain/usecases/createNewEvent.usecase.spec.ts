import { CreateNewEventUsecase } from './createNewEvent.usecase';
import { IEventGateway } from '../gateways/events.gateway';
import { CreateEventDto } from '../../infra/controllers/dto/create-event.dto';

describe('CreateNewEventUseCase', () => {
  const eventGatewayMock: IEventGateway = {
    createNewEvent: jest.fn(),
    getEvents: jest.fn(),
  };

  const createEventUsecase = new CreateNewEventUsecase(eventGatewayMock);

  it('should save a new event with a uuid', () => {
    //Given
    eventGatewayMock.createNewEvent = jest.fn().mockResolvedValue(undefined);
    const createEventDto: CreateEventDto = {} as any;

    //When
    const event = createEventUsecase.execute(createEventDto);

    //Then
    expect(event).toEqual('new EventObject(...)');
    expect(eventGatewayMock.createNewEvent).toHaveBeenCalledWith(
      'new EventObject(...)',
    );
  });
});
