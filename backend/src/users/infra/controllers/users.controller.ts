import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { CreateNewUserUsecase } from '../../domain/usecases/createNewUser.usecase';
import { LoginUserUseCase } from 'src/users/domain/usecases/loginUser.usecase';
import { GetUsersUsecase } from '../../domain/usecases/getUsers.usecase';
import { UserObject } from '../../domain/user';
import { AuthenticatedUser } from 'nest-keycloak-connect';
import { ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetProfilePictureUsecase } from 'src/users/domain/usecases/getProfilePicture.usecase';
import { GetListUsersUsecase } from 'src/users/domain/usecases/getListUsers.usecase';

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private createNewUserUsecase: CreateNewUserUsecase,
    private getUserUsecase: GetUsersUsecase,
    private loginUserUsecase: LoginUserUseCase,
    private getProfilePictureUsecase: GetProfilePictureUsecase,
    private getListUserUsecase: GetListUsersUsecase,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new ValidationPipe())
  async postUser(
    @UploadedFile() file: Express.Multer.File,
    @Body() user: CreateUserDto,
  ): Promise<UserObject> {
    return await this.createNewUserUsecase.execute(user, file);
  }

  /*@Post()
  @UsePipes(new ValidationPipe())
  async postUser(@Body() user: CreateUserDto): Promise<UserObject> {
    return this.createNewUserUsecase.execute(user);
  }*/

  @Get()
  find(@Query() filter: any): Promise<UserObject[]> {
    return this.getUserUsecase.execute(filter);
  }

  @Get('login')
  login(@AuthenticatedUser() keycloak_user: any): Promise<UserObject> {
    return this.loginUserUsecase.execute(keycloak_user);
  }

  @Get('/picture/:id')
  async getProfilePicture(@Param('id') id: string): Promise<string> {
    return await this.getProfilePictureUsecase.execute(id);
  }

  @Get('/find')
  find_many(@Query() filter: any): Promise<UserObject[]> {
    return this.getListUserUsecase.execute(filter);
  }
}
