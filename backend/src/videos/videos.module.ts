import { Module } from '@nestjs/common';
import { VideosController } from './infra/controllers/videos.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideoEntity } from './infra/gateways/entities/video.entity';
import { VideoGateway } from './infra/gateways/video.gateway';
import { CreateNewVideoUsecase } from './domain/usecases/createNewVideo.usecase';
import { GetVideosUsecase } from './domain/usecases/getVideos.usecase';
import { DeleteVideoUsecase } from './domain/usecases/deleteVideo.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([VideoEntity])],
  controllers: [VideosController],
  providers: [
    {
      provide: 'VideoGateway',
      useClass: VideoGateway,
    },
    CreateNewVideoUsecase,
    GetVideosUsecase,
    DeleteVideoUsecase,
  ],
})
export class VideosModule {}