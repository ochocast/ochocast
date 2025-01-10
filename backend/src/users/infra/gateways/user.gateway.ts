import { IUserGateway } from '../../domain/gateways/users.gateway';
import { UserObject } from '../../domain/user';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
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

  getListUsers(filter: any): Promise<UserObject[]> {
    const where: any = {};
    where.firstName = Like(`%${filter.value}%`);
    where.lastName = Like(`%${filter.value}%`);

    return this.usersRepository.find({
      where,
      relations: filter.id ? ['events'] : [],
    });
  }

  async loginUser(keycloak_user: any): Promise<UserObject> {
    let user = await this.usersRepository.findOne({
      where: {
        email: keycloak_user.email,
      },
      relations: ['events'],
    });
    if (!user) {
      user = await this.createNewUser(keycloak_user);
    }

    return user;
  }
}
