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
import { CreateTrackDto } from './dto/create-track.dto';
import { CreateNewTrackUsecase } from '../../domain/usecases/createNewTrack.usecase';
import { GetTracksUsecase } from '../../domain/usecases/getTracks.usecase';
import { isUUID } from 'class-validator';
import { UpdateTrackUsecase } from '../../domain/usecases/updateTrack.usecase';
import { TrackObject } from '../../domain/track';
import { DeleteTracksUsecase } from '../../domain/usecases/deleteTracks.usecase';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

@ApiTags('Tracks')
@Controller('tracks')
export class TracksController {
  constructor(
    private createNewTrackUsecase: CreateNewTrackUsecase,
    private getTracksUsecase: GetTracksUsecase,
    private updateTrackUsecase: UpdateTrackUsecase,
    private deleteTracksUsecase: DeleteTracksUsecase,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async postTrack(@Body() track: CreateTrackDto): Promise<TrackObject> {
    return await this.createNewTrackUsecase.execute(track);
  }

  // Standard GET route with query parameters
  @Get()
  @ApiOperation({
    description:
      'This request accepts query parameters in order to filter the results. Only the filter by id will expand the event field.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    required: false,
    description: 'Filter tracks by id',
  })
  findTracks(@Query() filter: any): Promise<TrackObject[]> {
    return this.getTracksUsecase.execute(filter);
  }

  @Put(':id')
  async updateEvent(
    @Param('id') id: string,
    @Body() track: TrackObject,
  ): Promise<TrackObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    track.id = id;
    return this.updateTrackUsecase.execute(track);
  }

  @Delete(':id')
  async deleteTrack(@Param('id') id: string): Promise<TrackObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteTracksUsecase.execute(id);
  }
}
