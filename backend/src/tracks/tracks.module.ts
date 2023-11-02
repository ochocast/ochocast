import { Module } from '@nestjs/common';
import { TracksController } from './infra/controllers/tracks.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackEntity } from './infra/gateways/entities/track.entity';
import { TrackGateway } from './infra/gateways/track.gateway';
import { CreateNewTrackUsecase } from './domain/usecases/createNewTrack.usecase';
import { GetTracksUsecase } from './domain/usecases/getTracks.usecase';
import { UpdateTrackUsecase } from './domain/usecases/updateTrack.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([TrackEntity])],
  controllers: [TracksController],
  providers: [
    {
      provide: 'TrackGateway',
      useClass: TrackGateway,
    },
    CreateNewTrackUsecase,
    GetTracksUsecase,
    UpdateTrackUsecase,
  ],
})
export class TracksModule {}
