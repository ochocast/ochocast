import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';
import { UserObject } from '../user';
import { v4 as uuid } from 'uuid';

export class LoginUserUseCase {
  constructor(
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(keycloak_user: any): Promise<UserObject> {
    console.table(keycloak_user);
    const user = new UserObject(
      uuid(),
      keycloak_user.preferred_username,
      keycloak_user.given_name,
      keycloak_user.family_name,
      keycloak_user.email,
      'user',
      [],
      [],
      [],
      keycloak_user.description,
      new Date(),
      null,
    );
    return await this.userGateway.loginUser(user);
  }
}
