import { Module } from '@nestjs/common';
import { EventsController } from './infra/controllers/events.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEntity } from './infra/gateways/entities/event.entity';
import { EventGateway } from './infra/gateways/event.gateway';
import { CreateNewEventUsecase } from './domain/usecases/createNewEvent.usecase';
import { GetEventsUsecase } from './domain/usecases/getEvents.usecase';
import { UpdateEventUsecase } from './domain/usecases/updateEvent.usecase';
import { DeleteEventUsecase } from './domain/usecases/deleteEvent.usecase';

@Module({
  imports: [TypeOrmModule.forFeature([EventEntity])],
  controllers: [EventsController],
  providers: [
    {
      provide: 'EventGateway',
      useClass: EventGateway,
    },
    CreateNewEventUsecase,
    GetEventsUsecase,
    UpdateEventUsecase,
    DeleteEventUsecase,
  ],
})
export class EventsModule {}
