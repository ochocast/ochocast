import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordingController } from './infra/controllers/recording.controller';
import { RecordingVMGateway } from './infra/gateways/recording-vm.gateway';
import { RecordingRepositoryGateway } from './infra/gateways/recording-repository.gateway';
import { RecordingEntity } from './infra/gateways/entities/recording.entity';
import { RecordingErrorEntity } from './infra/gateways/entities/recording-error.entity';
import { RecordingErrorGateway } from './infra/gateways/recording-error.gateway';
import { StartRecordingUsecase } from './domain/usecases/startRecording.usecase';
import { StopRecordingUsecase } from './domain/usecases/stopRecording.usecase';
import { PublishRecordingUsecase } from './domain/usecases/publishRecording.usecase';
import { CreateRecordingSegmentFromFileUsecase } from './domain/usecases/createRecordingSegmentFromFile.usecase';
import { GetTrackRecordingsUsecase } from './domain/usecases/getTrackRecordings.usecase';
import { GetRecordingMediaUrlUsecase } from './domain/usecases/getRecordingMediaUrl.usecase';
import { MergeRecordingsUsecase } from './domain/usecases/mergeRecordings.usecase';
import { DeleteRecordingUsecase } from './domain/usecases/deleteRecording.usecase';
import { MarkRecordingPublishedUsecase } from './domain/usecases/markRecordingPublished.usecase';
import { SetRecordingArmedUsecase } from './domain/usecases/setRecordingArmed.usecase';
import { HandleLiveEventUsecase } from './domain/usecases/handleLiveEvent.usecase';
import { GetRecordingStatusUsecase } from './domain/usecases/getRecordingStatus.usecase';
import { MergeResultConsumer } from './infra/merge-result.consumer';
import { VideosModule } from 'src/videos/videos.module';
import { TracksModule } from 'src/tracks/tracks.module';
import { S3Module } from 'src/s3.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecordingEntity, RecordingErrorEntity]),
    VideosModule,
    S3Module,
    forwardRef(() => TracksModule),
  ],
  controllers: [RecordingController],
  providers: [
    {
      provide: 'RecordingVMGateway',
      useClass: RecordingVMGateway,
    },
    {
      provide: 'RecordingRepositoryGateway',
      useClass: RecordingRepositoryGateway,
    },
    {
      provide: 'RecordingErrorGateway',
      useClass: RecordingErrorGateway,
    },
    StartRecordingUsecase,
    StopRecordingUsecase,
    PublishRecordingUsecase,
    CreateRecordingSegmentFromFileUsecase,
    GetTrackRecordingsUsecase,
    GetRecordingMediaUrlUsecase,
    MergeRecordingsUsecase,
    DeleteRecordingUsecase,
    MarkRecordingPublishedUsecase,
    SetRecordingArmedUsecase,
    HandleLiveEventUsecase,
    GetRecordingStatusUsecase,
    MergeResultConsumer,
  ],
  exports: [
    'RecordingVMGateway',
    'RecordingRepositoryGateway',
    'RecordingErrorGateway',
    StopRecordingUsecase,
    GetTrackRecordingsUsecase,
  ],
})
export class RecordingModule {}
