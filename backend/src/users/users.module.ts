import { Module } from '@nestjs/common';
import { UsersController } from './infra/controllers/users.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from './infra/gateways/entities/user.entity';
import { UserGateway } from './infra/gateways/user.gateway';
import { CreateNewUserUsecase } from './domain/usecases/createNewUser.usecase';
import { GetUsersUsecase } from './domain/usecases/getUsers.usecase';
import { LoginUserUseCase } from './domain/usecases/loginUser.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [UsersController],
  providers: [
    {
      provide: 'UserGateway',
      useClass: UserGateway,
    },
    CreateNewUserUsecase,
    GetUsersUsecase,
    LoginUserUseCase,
  ],
})
export class UsersModule {}
