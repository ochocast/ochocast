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
import { TracksService } from './tracks.service';
import { CreateTrackDto } from './dto/create-track.dto';
import { Track } from './track.entity';

@Controller('tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async postTrack(@Body() track: CreateTrackDto): Promise<Track> {
    return this.tracksService.insert(track);
  }

  // Standard GET route with query parameters
  @Get()
  find(@Query() filter: any): Promise<Track[]> {
    return this.tracksService.find(filter);
  }

  @Get(':id')
  async findOne(@Param('id') id: number): Promise<Track> {
    return this.tracksService.findOne(id);
  }
}
