import { Module } from '@nestjs/common';
import { RecordingController } from './infra/controllers/recording.controller';
import { RecordingVMGateway } from './infra/gateways/recording-vm.gateway';
import { StartRecordingUsecase } from './domain/usecases/startRecording.usecase';
import { StopRecordingUsecase } from './domain/usecases/stopRecording.usecase';
import { PublishRecordingUsecase } from './domain/usecases/publishRecording.usecase';
import { VideosModule } from 'src/videos/videos.module';
import { TracksModule } from 'src/tracks/tracks.module';
import { UsersModule } from 'src/users/users.module';
import { RecordingAuthorizationService } from './domain/recording-authorization.service';

@Module({
  imports: [VideosModule, TracksModule, UsersModule],
  controllers: [RecordingController],
  providers: [
    {
      provide: 'RecordingVMGateway',
      useClass: RecordingVMGateway,
    },
    RecordingAuthorizationService,
    StartRecordingUsecase,
    StopRecordingUsecase,
    PublishRecordingUsecase,
  ],
})
export class RecordingModule {}
