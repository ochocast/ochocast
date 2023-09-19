import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';
import { EventEntity } from '../entities/event.entity';

@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}
  @Post()
  postEvent(@Body() event: CreateEventDto): Promise<EventEntity> {
    return this.eventsService.insert(event);
  }

  @Get()
  getAll() {
    return this.eventsService.getAllEvents();
  }
}
