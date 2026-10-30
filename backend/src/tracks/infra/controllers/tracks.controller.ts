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
  Res,
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
import { Response } from 'express';
import { LiveRoomUsecase } from 'src/tracks/domain/usecases/liveRoom.usecase';
import { LiveRoomResponse } from 'src/tracks/domain/gateways/live-room.gateway';

@ApiTags('Tracks')
@Controller('tracks')
export class TracksController {
  constructor(
    private createNewTrackUsecase: CreateNewTrackUsecase,
    private getTrackByIdUsecase: GetTrackByIdUsecase,
    private updateTrackUsecase: UpdateTrackUsecase,
    private deleteTrackUsecase: DeleteTrackUsecase,
    private closeTrackUsecase: CloseTrackUsecase,
    private liveRoomUsecase: LiveRoomUsecase,
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

  // Live rooms: the browser of a speaker gets the stream key (WHIP URL) here, never
  // from the SFU control plane directly. The control plane's status code is kept.
  @Post(':id/live-room')
  openLiveRoom(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.relay(res, () =>
      this.liveRoomUsecase.open(this.uuid(id), email),
    );
  }

  @Get(':id/live-room')
  getLiveRoom(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.relay(res, () =>
      this.liveRoomUsecase.get(this.uuid(id), email),
    );
  }

  @Get(':id/live-room/status')
  getLiveRoomStatus(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.relay(res, () =>
      this.liveRoomUsecase.status(this.uuid(id), email),
    );
  }

  private uuid(id: string): string {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }
    return id;
  }

  private async relay(
    res: Response,
    call: () => Promise<LiveRoomResponse>,
  ): Promise<Record<string, unknown>> {
    const { status, body } = await call();
    res.status(status);
    return body;
  }
}
