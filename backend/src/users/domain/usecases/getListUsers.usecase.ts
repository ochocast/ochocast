import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';
import { UserObject } from '../user';

export class GetListUsersUsecase {
  constructor(
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(filter: any): Promise<UserObject[]> {
    return await this.userGateway.getListUsers(filter);
  }
}
