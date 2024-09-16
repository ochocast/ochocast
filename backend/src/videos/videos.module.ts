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


@Module({
  imports: [
    TypeOrmModule.forFeature([VideoEntity]),
    S3Module,
    ],
  controllers: [VideosController],
  providers: [
    {
      provide: 'VideoGateway',
      useClass: VideoGateway,
    },
    CreateNewVideoUsecase,
    GetVideosUsecase,
    DeleteVideoUsecase,
    GetMediaUsecase,
  ],
})
export class VideosModule {}