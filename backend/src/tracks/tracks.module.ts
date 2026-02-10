import { Module } from '@nestjs/common';
import { TracksController } from './infra/controllers/tracks.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrackEntity } from './infra/gateways/entities/track.entity';
import { TrackGateway } from './infra/gateways/track.gateway';
import { CreateNewTrackUsecase } from './domain/usecases/createNewTrack.usecase';
import { UpdateTrackUsecase } from './domain/usecases/updateTrack.usecase';
import { DeleteTrackUsecase } from './domain/usecases/deleteTrack.usecase';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { UserGateway } from 'src/users/infra/gateways/user.gateway';
import { GetTrackByIdUsecase } from './domain/usecases/getTrackById.usecase';
import { CloseTrackUsecase } from './domain/usecases/closeTrack.usecase';
import { EventGateway } from 'src/events/infra/gateways/event.gateway';
import { EventEntity } from 'src/events/infra/gateways/entities/event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TrackEntity, UserEntity, EventEntity])],
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
    {
      provide: 'EventGateway',
      useClass: EventGateway,
    },
    CreateNewTrackUsecase,
    GetTrackByIdUsecase,
    UpdateTrackUsecase,
    DeleteTrackUsecase,
    CloseTrackUsecase,
  ],
  exports: ['TrackGateway', 'EventGateway'],
})
export class TracksModule {}
