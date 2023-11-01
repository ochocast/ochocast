import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateTrackDto } from './dto/create-track.dto';
import { TrackEntity } from '../gateways/entities/track.entity';
import { CreateNewTrackUsecase } from '../../domain/usecases/createNewTrack.usecase';
import { GetTracksUsecase } from '../../domain/usecases/getTracks.usecase';

@Controller('tracks')
export class TracksController {
  constructor(
    private createNewTrackUsecase: CreateNewTrackUsecase,
    private getTracksUsecase: GetTracksUsecase,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async postTrack(@Body() track: CreateTrackDto): Promise<TrackEntity> {
    return await this.createNewTrackUsecase.execute(track);
  }

  // Standard GET route with query parameters
  @Get()
  find(@Query() filter: any): Promise<TrackEntity[]> {
    return this.getTracksUsecase.execute(filter);
  }
}
