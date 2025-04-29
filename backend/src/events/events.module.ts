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

@Module({
  imports: [TypeOrmModule.forFeature([EventEntity, UserEntity])],
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
  ],
})
export class EventsModule {}
