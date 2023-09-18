import { Body, Controller, Post } from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';

@Controller('events')
export class EventsController {
  @Post()
  createEvent(@Body() createEventDto: CreateEventDto) {
    console.log(createEventDto);
    return 'This action adds a new event';
  }
}
