import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
import { CreateVideoEditUsecase } from '../../domain/usecases/createVideoEdit.usecase';
import { GetVideoEditUsecase } from '../../domain/usecases/getVideoEdit.usecase';
import { RevertVideoEditUsecase } from '../../domain/usecases/revertVideoEdit.usecase';
import { SaveVideoEditUsecase } from '../../domain/usecases/saveVideoEdit.usecase';
import { RenderStatusObject, VideoEditObject } from '../../domain/videoEdit';
import { SaveVideoEditDto } from './dto/save-video-edit.dto';

function assertVideoId(id: string): void {
  if (!isUUID(id)) {
    throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
  }
}

@ApiTags('Video edits')
@ApiForbiddenResponse({ description: 'Neither the creator nor an admin.' })
@ApiNotFoundResponse({ description: 'Unknown user, video or montage.' })
@Controller('videos/:videoId/edit')
export class VideoEditsController {
  constructor(
    private createVideoEditUsecase: CreateVideoEditUsecase,
    private getVideoEditUsecase: GetVideoEditUsecase,
    private saveVideoEditUsecase: SaveVideoEditUsecase,
    private revertVideoEditUsecase: RevertVideoEditUsecase,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Start the montage of a video',
    description:
      'One segment covering the whole video, no text, render status draft.',
  })
  @ApiConflictResponse({
    description: 'The video already has a montage, or is not processed yet.',
  })
  async create(
    @Param('videoId') videoId: string,
    @CurrentUserEmail() email: string,
  ): Promise<VideoEditObject> {
    assertVideoId(videoId);
    return this.createVideoEditUsecase.execute(videoId, email);
  }

  @Get()
  @ApiOperation({ summary: 'Read the montage, segments in playback order' })
  @ApiOkResponse({ type: VideoEditObject })
  async get(
    @Param('videoId') videoId: string,
    @CurrentUserEmail() email: string,
  ): Promise<VideoEditObject> {
    assertVideoId(videoId);
    return this.getVideoEditUsecase.execute(videoId, email);
  }

  @Put()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @ApiOperation({
    summary: 'Replace the whole montage and render it',
    description:
      'Segments and their text layers replace the stored ones in one ' +
      'transaction, then the render is requested (status pending). ' +
      'Send the version read with GET.',
  })
  @ApiOkResponse({ type: VideoEditObject })
  @ApiBadRequestResponse({ description: 'Invalid montage; every reason.' })
  @ApiConflictResponse({
    description: 'Stale version, or a render is in progress.',
  })
  @ApiServiceUnavailableResponse({
    description: 'Rendering is not available, or could not be started.',
  })
  async save(
    @Param('videoId') videoId: string,
    @Body() body: SaveVideoEditDto,
    @CurrentUserEmail() email: string,
  ): Promise<VideoEditObject> {
    assertVideoId(videoId);
    return this.saveVideoEditUsecase.execute(
      videoId,
      body.version,
      body.segments,
      email,
    );
  }

  @Get('render-status')
  @ApiOperation({ summary: 'Render status of the montage, for polling' })
  @ApiOkResponse({ type: RenderStatusObject })
  async renderStatus(
    @Param('videoId') videoId: string,
    @CurrentUserEmail() email: string,
  ): Promise<RenderStatusObject> {
    assertVideoId(videoId);
    return this.getVideoEditUsecase.renderStatus(videoId, email);
  }

  @Post('revert')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Go back to the original video',
    description:
      'Viewers get the original back at once; the montage restarts from ' +
      'the whole video without text. The original is never modified.',
  })
  @ApiOkResponse({ type: VideoEditObject })
  @ApiConflictResponse({ description: 'A render is in progress.' })
  async revert(
    @Param('videoId') videoId: string,
    @CurrentUserEmail() email: string,
  ): Promise<VideoEditObject> {
    assertVideoId(videoId);
    return this.revertVideoEditUsecase.execute(videoId, email);
  }
}
