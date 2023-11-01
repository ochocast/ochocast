import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateNewUserUsecase } from '../../domain/usecases/createNewUser.usecase';
import { GetUsersUsecase } from '../../domain/usecases/getUsers.usecase';
import { UserObject } from '../../domain/user';

@Controller('users')
export class UsersController {
  constructor(
    private createNewUserUsecase: CreateNewUserUsecase,
    private getUserUsecase: GetUsersUsecase,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async postUser(@Body() user: CreateUserDto): Promise<UserObject> {
    return this.createNewUserUsecase.execute(user);
  }

  @Get()
  find(@Query() filter: any): Promise<UserObject[]> {
    return this.getUserUsecase.execute(filter);
  }
}
