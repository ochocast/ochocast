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
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { EventDataDto } from './dto/event-data.dto';
import { EventObject } from '../../domain/event';
import { CreateNewEventUsecase } from '../../domain/usecases/createNewEvent.usecase';
import { GetEventsUsecase } from '../../domain/usecases/getEvents.usecase';
import { UpdateEventUsecase } from '../../domain/usecases/updateEvent.usecase';
import { DeleteEventUsecase } from 'src/events/domain/usecases/deleteEvent.usecase';
import { isUUID } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUserEmail } from '../../../common/decorators/current-user-email.decorator';
import { PublicEventObject } from 'src/events/domain/publicEvent';
import { Public } from 'nest-keycloak-connect';
import { GetEventByIdUsecase } from 'src/events/domain/usecases/getEventById.usecase';
import { GetPrivateEventsUsecase } from 'src/events/domain/usecases/getPrivateEvents.usecase';
import { PublishEventUsecase } from 'src/events/domain/usecases/publishEvent.usecase';
import { CloseEventUsecase } from 'src/events/domain/usecases/closeEvent.usecase';
import { GetPrivateEventByIdUsecase } from 'src/events/domain/usecases/getPrivateEventById.usecase';
import { SubscribeToEventUsecase } from 'src/events/domain/usecases/subscribeToEvent.usecase';
import { UnsubscribeFromEventUsecase } from 'src/events/domain/usecases/unsubscribeFromEvent.usecase';
import { FileInterceptor } from '@nestjs/platform-express';
import { GetEventMiniatureUsecase } from 'src/events/domain/usecases/getEventsMiniature.usecase';

@ApiTags('Events')
@Controller('events')
export class EventsController {
  constructor(
    private createNewEventUsecase: CreateNewEventUsecase,
    private getEventsUsecase: GetEventsUsecase,
    private updateEventUsecase: UpdateEventUsecase,
    private deleteEventUsecase: DeleteEventUsecase,
    private getEventByIdUsecase: GetEventByIdUsecase,
    private getPrivateEventUsecase: GetPrivateEventsUsecase,
    private publishEventUseCase: PublishEventUsecase,
    private closeEventUseCase: CloseEventUsecase,
    private getPrivateEventByIdUsecase: GetPrivateEventByIdUsecase,
    private subscribeToEventUsecase: SubscribeToEventUsecase,
    private unsubscribeFromEventUsecase: UnsubscribeFromEventUsecase,
    private getEventMiniatureUsecase: GetEventMiniatureUsecase,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('miniature'))
  @UsePipes(new ValidationPipe())
  async createNewEvent(
    @UploadedFile() file: Express.Multer.File,
    @Body() event: EventDataDto & { image_slug: string },
    @CurrentUserEmail() email: string,
  ): Promise<EventObject> {
    const miniatureFile = file;
    return this.createNewEventUsecase.execute(email, event, miniatureFile);
  }

  @Get()
  @ApiOperation({
    description:
      'This request accepts query parameters in order to filter the results.',
  })
  findPublicEvents(
    @Query() filter: any,
    @CurrentUserEmail() email: string,
  ): Promise<PublicEventObject[]> {
    return this.getEventsUsecase.execute(filter, email);
  }

  @Get('unpublished')
  @ApiOperation({
    description:
      'This request accepts query parameters in order to filter the results.',
  })
  findPrivateEvents(
    @Query() filter: any,
    @CurrentUserEmail() email: string,
  ): Promise<PublicEventObject[]> {
    return this.getPrivateEventUsecase.execute(filter, email);
  }

  @Get('miniature/:id')
  async getEventMiniature(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<{ url: string }> {
    const url = await this.getEventMiniatureUsecase.execute(id, email);
    return { url };
  }

  @Get('private/:id')
  getPrivateEvent(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<EventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }
    return this.getPrivateEventByIdUsecase.execute(id, email);
  }

  @Public()
  @Get(':id')
  getEvent(@Param('id') id: string): Promise<PublicEventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }
    return this.getEventByIdUsecase.execute(id);
  }

  @Put(':id')
  @UseInterceptors(FileInterceptor('miniature'))
  async updateEvent(
    @Param('id') id: string,
    @Body() eventData: EventDataDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUserEmail() email: string,
  ): Promise<EventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return this.updateEventUsecase.execute(id, eventData, file, email);
  }

  @Put('publish/:id')
  async publishEvent(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<PublicEventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return this.publishEventUseCase.execute(id, email);
  }

  @Put('close/:id')
  async closeEvent(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<EventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return this.closeEventUseCase.execute(id, email);
  }

  @Put('subscribe/:id')
  async subscribeToEvent(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<PublicEventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return this.subscribeToEventUsecase.execute(id, email);
  }

  @Delete('unsubscribe/:id')
  async unsubscribeFromEvent(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<PublicEventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return this.unsubscribeFromEventUsecase.execute(id, email);
  }

  @Delete(':id')
  async deleteEvent(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<EventObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteEventUsecase.execute(id, email);
  }
}
