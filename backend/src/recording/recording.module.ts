import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordingController } from './infra/controllers/recording.controller';
import { PublicationRequestController } from './infra/controllers/publication-request.controller';
import { PublicationRequestEntity } from './infra/gateways/entities/publication-request.entity';
import { PublicationRequestGateway } from './infra/gateways/publication-request.gateway';
import { CreatePublicationRequestUsecase } from './domain/usecases/createPublicationRequest.usecase';
import { GetMyPublicationRequestsUsecase } from './domain/usecases/getMyPublicationRequests.usecase';
import { GetTrackPublicationRequestsUsecase } from './domain/usecases/getTrackPublicationRequests.usecase';
import { GetPublicationRequestUsecase } from './domain/usecases/getPublicationRequest.usecase';
import { GetPublicationRequestMediaUrlUsecase } from './domain/usecases/getPublicationRequestMediaUrl.usecase';
import { AcceptPublicationRequestUsecase } from './domain/usecases/acceptPublicationRequest.usecase';
import { RefusePublicationRequestUsecase } from './domain/usecases/refusePublicationRequest.usecase';
import { CancelPublicationRequestUsecase } from './domain/usecases/cancelPublicationRequest.usecase';
import { RecordingVMGateway } from './infra/gateways/recording-vm.gateway';
import { RecordingRepositoryGateway } from './infra/gateways/recording-repository.gateway';
import { RecordingEntity } from './infra/gateways/entities/recording.entity';
import { RecordingErrorEntity } from './infra/gateways/entities/recording-error.entity';
import { RecordingErrorGateway } from './infra/gateways/recording-error.gateway';
import { StartRecordingUsecase } from './domain/usecases/startRecording.usecase';
import { StopRecordingUsecase } from './domain/usecases/stopRecording.usecase';
import { CreateRecordingSegmentFromFileUsecase } from './domain/usecases/createRecordingSegmentFromFile.usecase';
import { GetTrackRecordingsUsecase } from './domain/usecases/getTrackRecordings.usecase';
import { GetRecordingMediaUrlUsecase } from './domain/usecases/getRecordingMediaUrl.usecase';
import { MergeRecordingsUsecase } from './domain/usecases/mergeRecordings.usecase';
import { DeleteRecordingUsecase } from './domain/usecases/deleteRecording.usecase';
import { MarkRecordingPublishedUsecase } from './domain/usecases/markRecordingPublished.usecase';
import { SetRecordingArmedUsecase } from './domain/usecases/setRecordingArmed.usecase';
import { HandleLiveEventUsecase } from './domain/usecases/handleLiveEvent.usecase';
import { GetRecordingStatusUsecase } from './domain/usecases/getRecordingStatus.usecase';
import { RecordingMergeJobEntity } from './infra/merge-jobs/recording-merge-job.entity';
import { RecordingMergeJobsService } from './infra/merge-jobs/recording-merge-jobs.service';
import { RecordingMergeJobsController } from './infra/merge-jobs/recording-merge-jobs.controller';
import { RecordingMergeDispatcher } from './infra/merge-jobs/recording-merge-dispatcher';
import { VideosModule } from 'src/videos/videos.module';
import { TracksModule } from 'src/tracks/tracks.module';
import { S3Module } from 'src/s3.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecordingEntity,
      RecordingErrorEntity,
      PublicationRequestEntity,
      RecordingMergeJobEntity,
    ]),
    VideosModule,
    S3Module,
    forwardRef(() => TracksModule),
  ],
  controllers: [
    RecordingController,
    PublicationRequestController,
    RecordingMergeJobsController,
  ],
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
    {
      provide: 'PublicationRequestGateway',
      useClass: PublicationRequestGateway,
    },
    StartRecordingUsecase,
    StopRecordingUsecase,
    CreateRecordingSegmentFromFileUsecase,
    GetTrackRecordingsUsecase,
    GetRecordingMediaUrlUsecase,
    MergeRecordingsUsecase,
    DeleteRecordingUsecase,
    MarkRecordingPublishedUsecase,
    SetRecordingArmedUsecase,
    HandleLiveEventUsecase,
    GetRecordingStatusUsecase,
    CreatePublicationRequestUsecase,
    GetMyPublicationRequestsUsecase,
    GetTrackPublicationRequestsUsecase,
    GetPublicationRequestUsecase,
    GetPublicationRequestMediaUrlUsecase,
    AcceptPublicationRequestUsecase,
    RefusePublicationRequestUsecase,
    CancelPublicationRequestUsecase,
    RecordingMergeJobsService,
    {
      provide: 'MergeJobDispatcher',
      useClass: RecordingMergeDispatcher,
    },
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
