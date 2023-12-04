import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateEventDto } from './dto/create-event.dto';
import { EventObject } from '../../domain/event';
import { CreateNewEventUsecase } from '../../domain/usecases/createNewEvent.usecase';
import { GetEventsUsecase } from '../../domain/usecases/getEvents.usecase';
import { UpdateEventUsecase } from '../../domain/usecases/updateEvent.usecase';
import { DeleteEventUsecase } from 'src/events/domain/usecases/deleteEvent.usecase';
import { isUUID } from 'class-validator';

@Controller('events')
export class EventsController {
  constructor(
    private createNewEventUsecase: CreateNewEventUsecase,
    private getEventsUsecase: GetEventsUsecase,
    private updateEventUsecase: UpdateEventUsecase,
    private deleteEventUsecase: DeleteEventUsecase,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async createNewEvent(@Body() event: CreateEventDto): Promise<EventObject> {
    return this.createNewEventUsecase.execute(event);
  }

  // Standard GET route with query parameters
  @Get()
  findEvents(@Query() filter: any): Promise<EventObject[]> {
    return this.getEventsUsecase.execute(filter);
  }

  @Put(':id')
  async updateEvent(
    @Param('id') id: string,
    @Body() event: EventObject,
  ): Promise<EventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    event.id = id;
    return this.updateEventUsecase.execute(event);
  }

  @Delete(':id')
  async deleteEvent(@Param('id') id: string): Promise<EventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteEventUsecase.execute(id);
  }
}
