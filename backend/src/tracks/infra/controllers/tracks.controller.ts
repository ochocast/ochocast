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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { TrackDto } from './dto/track.dto';
import { CreateNewTrackUsecase } from '../../domain/usecases/createNewTrack.usecase';
import { isUUID } from 'class-validator';
import { UpdateTrackUsecase } from '../../domain/usecases/updateTrack.usecase';
import { TrackObject } from '../../domain/track';
import { DeleteTrackUsecase } from '../../domain/usecases/deleteTrack.usecase';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { GetTrackByIdUsecase } from 'src/tracks/domain/usecases/getTrackById.usecase';
import { CloseTrackUsecase } from 'src/tracks/domain/usecases/closeTrack.usecase';
import { Public } from 'nest-keycloak-connect';

@ApiTags('Tracks')
@Controller('tracks')
export class TracksController {
  constructor(
    private createNewTrackUsecase: CreateNewTrackUsecase,
    private getTrackByIdUsecase: GetTrackByIdUsecase,
    private updateTrackUsecase: UpdateTrackUsecase,
    private deleteTrackUsecase: DeleteTrackUsecase,
    private closeTrackUsecase: CloseTrackUsecase,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async createTrack(@Body() track: TrackDto): Promise<TrackObject> {
    return await this.createNewTrackUsecase.execute(track);
  }

  @Public()
  @Get(':id')
  findTrack(@Param('id') id: string): Promise<TrackObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }
    return this.getTrackByIdUsecase.execute(id).then((e) => {
      console.log('\n\n\n', e, '\n\n\n');
      return e;
    });
  }

  @Put(':id')
  async updateTrack(
    @Param('id') id: string,
    @Body() track: TrackDto,
    @CurrentUserEmail() email: string,
  ): Promise<TrackObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return this.updateTrackUsecase.execute(id, track, email); // TODO
  }

  @Put(':id/close')
  async closeTrack(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<TrackObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return this.closeTrackUsecase.execute(id, email); // TODO
  }

  @Delete(':id')
  async deleteTrack(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<TrackObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteTrackUsecase.execute(id, email);
  }
}
