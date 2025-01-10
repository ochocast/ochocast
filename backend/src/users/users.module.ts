import { Module } from '@nestjs/common';
import { UsersController } from './infra/controllers/users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './infra/gateways/entities/user.entity';
import { UserGateway } from './infra/gateways/user.gateway';
import { CreateNewUserUsecase } from './domain/usecases/createNewUser.usecase';
import { GetUsersUsecase } from './domain/usecases/getUsers.usecase';
import { LoginUserUseCase } from './domain/usecases/loginUser.usecase';
import { S3Module } from 'src/s3.module';
import { GetProfilePictureUsecase } from './domain/usecases/getProfilePicture.usecase';
import { GetListUsersUsecase } from './domain/usecases/getListUsers.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), S3Module],
  controllers: [UsersController],
  providers: [
    {
      provide: 'UserGateway',
      useClass: UserGateway,
    },
    CreateNewUserUsecase,
    GetUsersUsecase,
    LoginUserUseCase,
    GetProfilePictureUsecase,
    GetListUsersUsecase,
  ],
})
export class UsersModule {}
