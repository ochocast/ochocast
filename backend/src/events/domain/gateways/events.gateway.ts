import { EventObject } from '../event';

export interface IEventGateway {
  createNewEvent: (event: EventObject) => Promise<EventObject>;
  getEvents: (filter: any) => Promise<EventObject[]>;
  updateEvent: (event: EventObject) => Promise<EventObject>;
  deleteEvent: (eventId: string) => Promise<EventObject>;
  getEventById(id: string): Promise<EventObject>;
}
