import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async insert(userDetails: CreateUserDto): Promise<User> {
    const user: User = new User({
      ...userDetails,
    });
    return await this.usersRepository.save(user);
  }

  async find(filter): Promise<User[]> {
    return await this.usersRepository.find({
      where: {
        ...filter,
      },
    });
  }

  async findOne(id: number): Promise<User> {
    return await this.usersRepository.findOneBy({
      id: id,
    });
  }
}
