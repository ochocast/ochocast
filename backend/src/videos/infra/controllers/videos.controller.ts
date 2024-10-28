import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { CreateVideoDto } from './dto/create-video.dto';
import { CreateNewVideoUsecase } from '../../domain/usecases/createNewVideo.usecase';
import { GetVideosUsecase } from '../../domain/usecases/getVideos.usecase';
import { isUUID } from 'class-validator';
import { VideoObject } from '../../domain/video';
import { DeleteVideoUsecase } from '../../domain/usecases/deleteVideo.usecase';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { GetMediaUsecase } from 'src/videos/domain/usecases/getMedia.usecase';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { GetMiniatureUsecase } from 'src/videos/domain/usecases/getMiniature.usecase';

@ApiTags('Videos')
@Controller('videos')
export class VideosController {
  constructor(
    private createNewVideoUsecase: CreateNewVideoUsecase,
    private getVideosUsecase: GetVideosUsecase,
    private deleteVideoUsecase: DeleteVideoUsecase,
    private getMediaUseCase: GetMediaUsecase,
    private getMiniatureUseCase: GetMiniatureUsecase,
  ) {}

  /*@Post()
  @UseInterceptors(FileInterceptor('file'))
  @UsePipes(new ValidationPipe())
  async postVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body() video: CreateVideoDto,
  ): Promise<VideoObject> {
    return await this.createNewVideoUsecase.execute(video, file);
  }*/

  @Post()
  @UseInterceptors(AnyFilesInterceptor())
  @UsePipes(new ValidationPipe())
  async postVideo(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() video: CreateVideoDto & { media_id: string; miniature_id: string },
  ): Promise<VideoObject> {
    const videoFile = files.find((file) => file.fieldname === 'file');
    const miniatureFile = files.find((file) => file.fieldname === 'miniature');

    return await this.createNewVideoUsecase.execute(
      video,
      videoFile,
      miniatureFile,
    );
  }

  // Standard GET route with query parameters
  @Get()
  @ApiOperation({
    description:
      'This request accepts query parameters in order to filter the results. Only the filter by id will expand the event field.',
  })
  findVideos(@Query() filter: any): Promise<VideoObject[]> {
    console.log('passed by');
    return this.getVideosUsecase.execute(filter);
  }

  @Delete(':id')
  async deleteVideo(@Param('id') id: string): Promise<VideoObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteVideoUsecase.execute(id);
  }

  @Get('/media/:id')
  async getMedia(@Param('id') id: string): Promise<string> {
    return await this.getMediaUseCase.execute(id);
  }

  @Get('/miniature/:id')
  async getMiniature(@Param('id') id: string): Promise<string> {
    return await this.getMiniatureUseCase.execute(id);
  }
}
