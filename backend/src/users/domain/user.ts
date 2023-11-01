import { EventObject } from '../../events/domain/event';

export class UserObject {
  constructor(
    public id: string,
    public firstName: string,
    public lastName: string,
    public email: string,
    public role: string,
    public events: EventObject[],
    public createdAt: Date,
  ) {}
}
