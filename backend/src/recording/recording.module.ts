import { Module } from '@nestjs/common';
import { RecordingController } from './infra/controllers/recording.controller';
import { RecordingVMGateway } from './infra/gateways/recording-vm.gateway';
import { StartRecordingUsecase } from './domain/usecases/startRecording.usecase';
import { StopRecordingUsecase } from './domain/usecases/stopRecording.usecase';
import { PublishRecordingUsecase } from './domain/usecases/publishRecording.usecase';
import { VideosModule } from 'src/videos/videos.module';
import { TracksModule } from 'src/tracks/tracks.module';

@Module({
  imports: [VideosModule, TracksModule],
  controllers: [RecordingController],
  providers: [
    {
      provide: 'RecordingVMGateway',
      useClass: RecordingVMGateway,
    },
    StartRecordingUsecase,
    StopRecordingUsecase,
    PublishRecordingUsecase,
  ],
})
export class RecordingModule {}
