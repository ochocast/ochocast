import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { EventObject } from '../../domain/event';
import { CreateNewEventUsecase } from '../../domain/usecases/createNewEvent.usecase';
import { GetEventsUsecase } from '../../domain/usecases/getEvents.usecase';

@Controller('events')
export class EventsController {
  constructor(
    private createNewEventUsecase: CreateNewEventUsecase,
    private getEventsUsecase: GetEventsUsecase,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async createNewEvent(@Body() event: CreateEventDto): Promise<EventObject> {
    return this.createNewEventUsecase.execute(event);
  }

  // Standard GET route with query parameters
  @Get()
  find(@Query() filter: any): Promise<EventObject[]> {
    return this.getEventsUsecase.execute(filter);
  }
}
