import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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

  // Standard GET route with query parameters
  @Get()
  find(@Query() filter: any): Promise<Event[]> {
    return this.eventsService.find(filter);
  }

  @Get(':id')
  async findOne(@Param('id') id: number): Promise<Event> {
    return this.eventsService.findOne(id);
  }
}
