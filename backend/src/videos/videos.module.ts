import { VideoUpload } from './uploads/upload.entity';
import { UploadsModule } from './uploads/uploads.module';
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
import { searchVideoUseCase } from './domain/usecases/searchVideo.usecase';
import { GetSuggestionsUsecase } from './domain/usecases/getSuggestions.usecase';
import { GetSubtitleUsecase } from './domain/usecases/getSubtitle.usecase';
import { UsersModule } from 'src/users/users.module';
import { searchVideoAdminUseCase } from './domain/usecases/searchVideoAdmin.usecase';
import { RestoreVideoUsecase } from './domain/usecases/restoreVideo.usecase';
import { IncrementVideoViewsUsecase } from './domain/usecases/incrementVideoViews.usecase';
import { QueueModule } from 'src/queue/queue.module';
import { TranscodingJobEntity } from 'src/transcoding-jobs/transcoding-job.entity';
import { VideoProcessingController } from './infra/controllers/videoProcessing.controller';
import { VideoProcessingGateway } from './infra/gateways/videoProcessing.gateway';
import { GetVideoProcessingUsecase } from './domain/usecases/getVideoProcessing.usecase';

// import { GetUsersUsecase } from 'src/users/domain/usecases/getUsers.usecase';

@Module({
  imports: [
    TypeOrmModule.forFeature([VideoEntity, VideoUpload, TranscodingJobEntity]),
    S3Module,
    UsersModule,
    QueueModule,
    UploadsModule,
  ],
  // VideoProcessingController last: see its route-order note.
  controllers: [VideosController, VideoProcessingController],
  providers: [
    {
      provide: 'VideoGateway',
      useClass: VideoGateway,
    },
    CreateNewVideoUsecase,
    GetVideosUsecase,
    DeleteVideoUsecase,
    RestoreVideoUsecase,
    DeleteVideoAdminUsecase,
    GetMediaUsecase,
    GetMiniatureUsecase,
    GetSubtitleUsecase,
    GetVideosAdminUsecase,
    ModifyVideoUsecase,
    searchVideoUseCase,
    GetSuggestionsUsecase,
    searchVideoAdminUseCase,
    IncrementVideoViewsUsecase,
    {
      provide: 'VideoProcessingGateway',
      useClass: VideoProcessingGateway,
    },
    GetVideoProcessingUsecase,
    // GetUsersUsecase,
  ],
  exports: [CreateNewVideoUsecase, 'VideoGateway'],
})
export class VideosModule {}
