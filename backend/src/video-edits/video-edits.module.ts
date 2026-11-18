import { AnalysisJobEntity } from './infra/analysis/analysis-job.entity';
import { AnalysisService } from './infra/analysis/analysis.service';
import {
  AnalysisController,
  AnalysisCallbacksController,
} from './infra/analysis/analysis.controller';
import { GetVideoEditSourceUsecase } from './domain/usecases/getVideoEditSource.usecase';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { VideosModule } from 'src/videos/videos.module';
import { CreateVideoEditUsecase } from './domain/usecases/createVideoEdit.usecase';
import { GetVideoEditUsecase } from './domain/usecases/getVideoEdit.usecase';
import { RevertVideoEditUsecase } from './domain/usecases/revertVideoEdit.usecase';
import { SaveVideoEditUsecase } from './domain/usecases/saveVideoEdit.usecase';
import { VideoEditsController } from './infra/controllers/video-edits.controller';
import { VideoEditEntity } from './infra/gateways/entities/video-edit.entity';
import { VideoEditSegmentEntity } from './infra/gateways/entities/video-edit-segment.entity';
import { VideoEditTextLayerEntity } from './infra/gateways/entities/video-edit-text-layer.entity';
import { VideoEditGateway } from './infra/gateways/video-edit.gateway';
import { S3Module } from 'src/s3.module';
import { VideoEditRenderJobEntity } from './infra/render-jobs/video-edit-render-job.entity';
import { VideoEditRenderJobsService } from './infra/render-jobs/video-edit-render-jobs.service';
import { VideoEditRenderJobsController } from './infra/render-jobs/video-edit-render-jobs.controller';
import { VideoEditRenderDispatcher } from './infra/render-jobs/video-edit-render-dispatcher';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VideoEditEntity,
      VideoEditSegmentEntity,
      VideoEditTextLayerEntity,
      VideoEditRenderJobEntity,
      AnalysisJobEntity,
    ]),
    S3Module,
    UsersModule,
    VideosModule,
  ],
  controllers: [
    VideoEditsController,
    VideoEditRenderJobsController,
    AnalysisController,
    AnalysisCallbacksController,
  ],
  providers: [
    { provide: 'VideoEditGateway', useClass: VideoEditGateway },
    // Disabled (PUT answers 503) without VIDEO_EDIT_RENDER_QUEUE_URL.
    {
      provide: 'VideoEditRenderDispatcher',
      useClass: VideoEditRenderDispatcher,
    },
    VideoEditRenderJobsService,
    AnalysisService,
    CreateVideoEditUsecase,
    GetVideoEditUsecase,
    GetVideoEditSourceUsecase,
    SaveVideoEditUsecase,
    RevertVideoEditUsecase,
  ],
})
export class VideoEditsModule {}
