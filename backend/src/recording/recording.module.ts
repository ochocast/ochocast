import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecordingController } from './infra/controllers/recording.controller';
import { RecordingVMGateway } from './infra/gateways/recording-vm.gateway';
import { RecordingRepositoryGateway } from './infra/gateways/recording-repository.gateway';
import { RecordingEntity } from './infra/gateways/entities/recording.entity';
import { StartRecordingUsecase } from './domain/usecases/startRecording.usecase';
import { StopRecordingUsecase } from './domain/usecases/stopRecording.usecase';
import { PublishRecordingUsecase } from './domain/usecases/publishRecording.usecase';
import { CreateRecordingSegmentFromFileUsecase } from './domain/usecases/createRecordingSegmentFromFile.usecase';
import { GetTrackRecordingsUsecase } from './domain/usecases/getTrackRecordings.usecase';
import { GetRecordingMediaUrlUsecase } from './domain/usecases/getRecordingMediaUrl.usecase';
import { VideosModule } from 'src/videos/videos.module';
import { TracksModule } from 'src/tracks/tracks.module';
import { S3Module } from 'src/s3.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecordingEntity]),
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
    StartRecordingUsecase,
    StopRecordingUsecase,
    PublishRecordingUsecase,
    CreateRecordingSegmentFromFileUsecase,
    GetTrackRecordingsUsecase,
    GetRecordingMediaUrlUsecase,
  ],
  exports: [
    'RecordingVMGateway',
    'RecordingRepositoryGateway',
    StopRecordingUsecase,
    GetTrackRecordingsUsecase,
  ],
})
export class RecordingModule {}
