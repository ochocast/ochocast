import { Module } from '@nestjs/common';
import { EventsController } from './infra/controllers/events.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './infra/gateways/entities/event.entity';
import { EventGateway } from './infra/gateways/event.gateway';
import { CreateNewEventUsecase } from './domain/usecases/createNewEvent.usecase';
import { GetEventsUsecase } from './domain/usecases/getEvents.usecase';
import { UpdateEventUsecase } from './domain/usecases/updateEvent.usecase';
import { DeleteEventUsecase } from './domain/usecases/deleteEvent.usecase';
import { UserGateway } from 'src/users/infra/gateways/user.gateway';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { GetEventByIdUsecase } from './domain/usecases/getEventById.usecase';
import { GetPrivateEventsUsecase } from './domain/usecases/getPrivateEvents.usecase';
import { PublishEventUsecase } from './domain/usecases/publishEvent.usecase';
import { CloseEventUsecase } from './domain/usecases/closeEvent.usecase';
import { GetPrivateEventByIdUsecase } from './domain/usecases/getPrivateEventById.usecase';
import { SubscribeToEventUsecase } from './domain/usecases/subscribeToEvent.usecase';
import { UnsubscribeFromEventUsecase } from './domain/usecases/unsubscribeFromEvent.usecase';
import { S3Module } from 'src/s3.module';
import { GetEventMiniatureUsecase } from './domain/usecases/getEventsMiniature.usecase';
import { CloseExpiredEventsScheduler } from './closeExpiredEvents.scheduler';
import { CloseExpiredEventsUsecase } from './domain/usecases/closeExpiredEvents.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([EventEntity, UserEntity]), S3Module],
  controllers: [EventsController],
  providers: [
    {
      provide: 'EventGateway',
      useClass: EventGateway,
    },
    {
      provide: 'UserGateway',
      useClass: UserGateway,
    },
    CreateNewEventUsecase,
    GetEventsUsecase,
    UpdateEventUsecase,
    DeleteEventUsecase,
    GetEventByIdUsecase,
    GetPrivateEventsUsecase,
    PublishEventUsecase,
    CloseEventUsecase,
    GetPrivateEventByIdUsecase,
    SubscribeToEventUsecase,
    UnsubscribeFromEventUsecase,
    GetEventMiniatureUsecase,
    CloseExpiredEventsUsecase,
    CloseExpiredEventsScheduler,
  ],
})
export class EventsModule {}
