import { IUserGateway } from '../../domain/gateways/users.gateway';
import { UserObject } from '../../domain/user';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { toEventEntity } from 'src/common/mapper/event.mapper';
import { toUserObject } from 'src/common/mapper/user.mapper';

export class UserGateway implements IUserGateway {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
  ) {}

  async createNewUser(userDetails: UserObject): Promise<UserObject> {
    const user: UserEntity = new UserEntity({
      ...userDetails,
      events: userDetails.events?.map(toEventEntity),
    });

    return toUserObject(await this.usersRepository.save(user));
  }

  getUsers(filter: any): Promise<UserObject[]> {
    return this.usersRepository
      .find({
        where: {
          ...filter,
        },
        relations: filter.id ? ['events'] : [],
      })
      .then((entities) => entities.map(toUserObject));
  }

  getListUsers(filter: any): Promise<UserObject[]> {
    const where: any = {};
    where.firstName = ILike(`%${filter.value}%`);
    where.lastName = ILike(`%${filter.value}%`);

    return this.usersRepository
      .find({
        where,
        relations: filter.id ? ['events'] : [],
      })
      .then((entities) => entities.map(toUserObject));
  }

  async loginUser(keycloak_user: any): Promise<UserObject> {
    let user: UserObject | null = null;

    const foundUser = await this.usersRepository.findOne({
      where: {
        email: keycloak_user.email,
      },
      relations: ['events'],
    });

    if (foundUser) {
      user = toUserObject(foundUser);
    } else {
      user = await this.createNewUser(keycloak_user);
    }

    return user;
  }

  async getUserByEmail(email: string): Promise<UserObject | null> {
    const user = await this.usersRepository.findOne({
      where: { email },
      relations: ['events'],
    });

    return user ? toUserObject(user) : null;
  }

  async getUserById(id: string): Promise<UserObject | null> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['events'],
    });

    return user ? toUserObject(user) : null;
  }
}
