import { IUserGateway } from '../../domain/gateways/users.gateway';
import { UserObject } from '../../domain/user';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';

export class UserGateway implements IUserGateway {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async createNewUser(userDetails: UserObject): Promise<UserObject> {
    const user: UserEntity = new UserEntity({
      ...userDetails,
    });

    return await this.usersRepository.save(user);
  }

  getUsers(filter: any): Promise<UserObject[]> {
    return this.usersRepository.find({
      where: {
        ...filter,
      },
      relations: filter.id ? ['events'] : [],
    });
  }
}
