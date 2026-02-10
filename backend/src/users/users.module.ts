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
import { AddFavoriteVideoUsecase } from './domain/usecases/addFavoriteVideo.usecase';
import { RemoveFavoriteVideoUsecase } from './domain/usecases/removeFavoriteVideo.usecase';
import { IsFavoriteVideoUsecase } from './domain/usecases/isFavoriteVideo.usecase';
import { GetFavoriteVideosUsecase } from './domain/usecases/getFavoriteVideo.usecase';
import { UpdateProfileUseCase } from './domain/usecases/updateProfile.usecase';
import { UpdateProfileUseCaseWithoutImage } from './domain/usecases/updateProfileWithoutImage.usecase';
import { AddLikedCommentUsecase } from './domain/usecases/addLikedComment.usecase';
import { RemoveLikedCommentUsecase } from './domain/usecases/removeLikedComment.usecase';
import { GetLikedCommentUsecase } from './domain/usecases/getLikeComments.usecase';

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
    AddFavoriteVideoUsecase,
    RemoveFavoriteVideoUsecase,
    IsFavoriteVideoUsecase,
    GetFavoriteVideosUsecase,
    UpdateProfileUseCase,
    UpdateProfileUseCaseWithoutImage,
    AddLikedCommentUsecase,
    RemoveLikedCommentUsecase,
    GetLikedCommentUsecase,
  ],
  exports: ['UserGateway'],
})
export class UsersModule {}
