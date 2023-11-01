import { UserObject } from '../user';

export interface IUserGateway {
  createNewUser: (user: UserObject) => Promise<UserObject>;
  getUsers: (filter: any) => Promise<UserObject[]>;
}
