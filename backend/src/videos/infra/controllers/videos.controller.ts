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
  UploadedFiles,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateVideoDto } from './dto/create-video.dto';
import { ModifyVideoDto } from './dto/modify-video.dto';
import { CreateNewVideoUsecase } from '../../domain/usecases/createNewVideo.usecase';
import { GetVideosUsecase } from '../../domain/usecases/getVideos.usecase';
import { GetVideosAdminUsecase } from '../../domain/usecases/getVideosAdmin.usecase';
import { isUUID } from 'class-validator';
import { VideoObject } from '../../domain/video';
import { DeleteVideoUsecase } from '../../domain/usecases/deleteVideo.usecase';
import { DeleteVideoAdminUsecase } from '../../domain/usecases/deleteVideoAdmin.usecase';
//import { GetUsersUsecase } from 'src/users/domain/usecases/getUsers.usecase';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { GetMediaUsecase } from 'src/videos/domain/usecases/getMedia.usecase';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { GetMiniatureUsecase } from 'src/videos/domain/usecases/getMiniature.usecase';
import logger from '../../../utils/logger';
import { ModifyVideoUsecase } from 'src/videos/domain/usecases/modifyVideo.usecase';
@ApiTags('Videos')
@Controller('videos')
export class VideosController {
  constructor(
    private createNewVideoUsecase: CreateNewVideoUsecase,
    private getVideosUsecase: GetVideosUsecase,
    private deleteVideoUsecase: DeleteVideoUsecase,
    private deleteVideoAdminUsecase: DeleteVideoAdminUsecase,
    private getMediaUseCase: GetMediaUsecase,
    private getMiniatureUseCase: GetMiniatureUsecase,
    private getVideosAdminUsecase: GetVideosAdminUsecase,
    private modifyVideoUseCase: ModifyVideoUsecase,
    //private getUsersUsecase: GetUsersUsecase,
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

  @Get('/all')
  @ApiOperation({
    description:
      'This request accepts query parameters in order to filter the results. Only the filter by id will expand the event field.',
  })
  findValidVideos(@Query() filter: any): Promise<VideoObject[]> {
    console.log('passed by');
    return this.getVideosAdminUsecase.execute(filter);
  }
  
  @Post('/modify')
  async modifyVideo(@Body() video: ModifyVideoDto & {media_id: string; miniature_id: string}){
    return this.modifyVideoUseCase.execute(video);
  }

  @Delete(':id')
  async deleteVideo(@Param('id') id: string): Promise<VideoObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteVideoUsecase.execute(id);
  }

  @Delete('/admin/:id')
  async deleteVideoAdmin(@Param('id') id: string): Promise<VideoObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteVideoAdminUsecase.execute(id);
  }

  @Get('/media/:id')
  async getMedia(@Param('id') id: string): Promise<string> {
    return await this.getMediaUseCase.execute(id);
  }

  @Get('/miniature/:id')
  async getMiniature(@Param('id') id: string): Promise<string> {
    return await this.getMiniatureUseCase.execute(id);
  }

  @Get(':userId')
  async getVideosByUser (@Param('userId') id: string): Promise<VideoObject[]> {
    //const user = await this.getUsersUsecase.execute({id: id});

    console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    console.log(id);
    const videos = await this.getVideosUsecase.execute({creator: {id}});
    console.log(videos);
    return videos;
  }
}
