import { Module } from '@nestjs/common';
import { TracksController } from './infra/controllers/tracks.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackEntity } from './infra/gateways/entities/track.entity';
import { TrackGateway } from './infra/gateways/track.gateway';
import { CreateNewTrackUsecase } from './domain/usecases/createNewTrack.usecase';
import { GetTracksUsecase } from './domain/usecases/getTracks.usecase';
import { UpdateTrackUsecase } from './domain/usecases/updateTrack.usecase';
import { DeleteTracksUsecase } from './domain/usecases/deleteTracks.usecase';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { UserGateway } from 'src/users/infra/gateways/user.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([TrackEntity, UserEntity])],
  controllers: [TracksController],
  providers: [
    {
      provide: 'TrackGateway',
      useClass: TrackGateway,
    },
    {
      provide: 'UserGateway',
      useClass: UserGateway,
    },
    CreateNewTrackUsecase,
    GetTracksUsecase,
    UpdateTrackUsecase,
    DeleteTracksUsecase,
  ],
})
export class TracksModule {}
