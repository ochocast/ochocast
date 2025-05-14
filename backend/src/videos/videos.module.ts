import { Module } from '@nestjs/common';
import { VideosController } from './infra/controllers/videos.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoEntity } from './infra/gateways/entities/video.entity';
import { VideoGateway } from './infra/gateways/video.gateway';
import { CreateNewVideoUsecase } from './domain/usecases/createNewVideo.usecase';
import { GetVideosUsecase } from './domain/usecases/getVideos.usecase';
import { DeleteVideoUsecase } from './domain/usecases/deleteVideo.usecase';
import { GetMediaUsecase } from './domain/usecases/getMedia.usecase';
import { S3Module } from 'src/s3.module';
import { GetMiniatureUsecase } from './domain/usecases/getMiniature.usecase';
import { DeleteVideoAdminUsecase } from './domain/usecases/deleteVideoAdmin.usecase';
import { GetVideosAdminUsecase } from './domain/usecases/getVideosAdmin.usecase';
import { ModifyVideoUsecase } from './domain/usecases/modifyVideo.usecase';
import { GetVideosSuggestionsUsecase } from './domain/usecases/getVideosSuggestions.usecase';
// import { GetUsersUsecase } from 'src/users/domain/usecases/getUsers.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([VideoEntity]), S3Module],
  controllers: [VideosController],
  providers: [
    {
      provide: 'VideoGateway',
      useClass: VideoGateway,
    },
    CreateNewVideoUsecase,
    GetVideosUsecase,
    DeleteVideoUsecase,
    DeleteVideoAdminUsecase,
    GetMediaUsecase,
    GetMiniatureUsecase,
    GetVideosAdminUsecase,
    ModifyVideoUsecase,
    GetVideosSuggestionsUsecase,
    // GetUsersUsecase,
  ],
})
export class VideosModule {}
