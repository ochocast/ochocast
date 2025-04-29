import { UserObject } from '../user';

export interface IUserGateway {
  createNewUser: (user: UserObject) => Promise<UserObject>;
  getUsers: (filter: any) => Promise<UserObject[]>;
  loginUser: (keycloak_user: any) => Promise<UserObject>;
  getListUsers: (filter: any) => Promise<UserObject[]>;
  getUserByEmail(email: string): Promise<UserObject | null>;
  getUserById(id: string): Promise<UserObject | null>;
}
