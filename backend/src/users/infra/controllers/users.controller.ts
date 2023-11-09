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
import { LoginUserUseCase } from 'src/users/domain/usecases/loginUser.usecase';
import { GetUsersUsecase } from '../../domain/usecases/getUsers.usecase';
import { UserObject } from '../../domain/user';
import { AuthenticatedUser } from 'nest-keycloak-connect';

@Controller('users')
export class UsersController {
  constructor(
    private createNewUserUsecase: CreateNewUserUsecase,
    private getUserUsecase: GetUsersUsecase,
    private loginUserUsecase: LoginUserUseCase,
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

  @Get('login')
  login(@AuthenticatedUser() keycloak_user: any): Promise<UserObject> {
    return this.loginUserUsecase.execute(keycloak_user);
  }
}
