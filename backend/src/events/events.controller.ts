import {
  Body,
  Controller,
  Get,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';
import { Event } from './event.entity';

@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async postEvent(@Body() event: CreateEventDto): Promise<Event> {
    return this.eventsService.insert(event);
  }

  @Get()
  findAll(): Promise<Event[]> {
    return this.eventsService.findAll();
  }
}
