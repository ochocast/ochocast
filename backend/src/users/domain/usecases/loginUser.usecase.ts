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
    const user = new UserObject(
      uuid(),
      keycloak_user.given_name,
      keycloak_user.family_name,
      keycloak_user.email,
      'user',
      [],
      new Date(),
    );
    return await this.userGateway.loginUser(user);
  }
}
