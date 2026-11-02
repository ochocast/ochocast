import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from 'src/users/users.module';
import { VideosModule } from 'src/videos/videos.module';
import { CreateVideoEditUsecase } from './domain/usecases/createVideoEdit.usecase';
import { GetVideoEditUsecase } from './domain/usecases/getVideoEdit.usecase';
import { RevertVideoEditUsecase } from './domain/usecases/revertVideoEdit.usecase';
import { SaveVideoEditUsecase } from './domain/usecases/saveVideoEdit.usecase';
import { VideoEditsController } from './infra/controllers/video-edits.controller';
import { DisabledVideoEditRenderDispatcher } from './infra/gateways/disabled-render-dispatcher';
import { VideoEditEntity } from './infra/gateways/entities/video-edit.entity';
import { VideoEditSegmentEntity } from './infra/gateways/entities/video-edit-segment.entity';
import { VideoEditTextLayerEntity } from './infra/gateways/entities/video-edit-text-layer.entity';
import { VideoEditGateway } from './infra/gateways/video-edit.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      VideoEditEntity,
      VideoEditSegmentEntity,
      VideoEditTextLayerEntity,
    ]),
    UsersModule,
    VideosModule,
  ],
  controllers: [VideoEditsController],
  providers: [
    { provide: 'VideoEditGateway', useClass: VideoEditGateway },
    // Replaced by the queue-backed dispatcher with the rendering step.
    {
      provide: 'VideoEditRenderDispatcher',
      useClass: DisabledVideoEditRenderDispatcher,
    },
    CreateVideoEditUsecase,
    GetVideoEditUsecase,
    SaveVideoEditUsecase,
    RevertVideoEditUsecase,
  ],
})
export class VideoEditsModule {}
