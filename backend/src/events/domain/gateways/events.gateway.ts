import { EventObject } from '../event';

export interface IEventGateway {
  createNewEvent: (event: EventObject) => Promise<EventObject>;
  getEvents: (filter: any) => Promise<EventObject[]>;
}
