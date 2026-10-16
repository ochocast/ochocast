import {
  Controller,
  Get,
  Header,
  HttpException,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { Public } from 'nest-keycloak-connect';
import { GetVideoProcessingUsecase } from '../../domain/usecases/getVideoProcessing.usecase';
import { VideoProcessingStatus } from '../../domain/videoProcessing';

// Registered after VideosController: its static two-segment routes
// (searchvideo/:data, media/:id...) must keep matching first.
@ApiTags('Videos')
@Controller('videos')
export class VideoProcessingController {
  constructor(private readonly getVideoProcessing: GetVideoProcessingUsecase) {}

  @Public()
  @Get(':id/processing')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    description:
      'Light, public processing state of a video, polled while it is prepared: ' +
      'queued, processing, retrying, ready or failed (with a reason code).',
  })
  getProcessing(@Param('id') id: string): Promise<VideoProcessingStatus> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }
    return this.getVideoProcessing.execute(id);
  }
}
