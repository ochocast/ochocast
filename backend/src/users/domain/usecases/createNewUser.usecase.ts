import { CreateUserDto } from '../../infra/controllers/dto/create-user.dto';
import { UserObject } from '../user';
import { IUserGateway } from '../gateways/users.gateway';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';

export class CreateNewUserUsecase {
  constructor(
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(userToCreate: CreateUserDto): Promise<UserObject> {
    const user = new UserObject(
      uuid(),
      userToCreate.firstName,
      userToCreate.lastName,
      userToCreate.email,
      userToCreate.role,
      [],
      new Date(),
    );

    await this.userGateway.createNewUser(user);
    return user;
  }
}
