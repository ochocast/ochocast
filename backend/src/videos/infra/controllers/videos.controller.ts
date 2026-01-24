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
import { RestoreVideoUsecase } from '../../domain/usecases/restoreVideo.usecase';
import { GetVideosAdminUsecase } from '../../domain/usecases/getVideosAdmin.usecase';
import { isUUID } from 'class-validator';
import { VideoObject } from '../../domain/video';
import { DeleteVideoUsecase } from '../../domain/usecases/deleteVideo.usecase';
import { DeleteVideoAdminUsecase } from '../../domain/usecases/deleteVideoAdmin.usecase';
//import { GetUsersUsecase } from 'src/users/domain/usecases/getUsers.usecase';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { GetMediaUsecase } from 'src/videos/domain/usecases/getMedia.usecase';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { GetMiniatureUsecase } from 'src/videos/domain/usecases/getMiniature.usecase';
import { ModifyVideoUsecase } from 'src/videos/domain/usecases/modifyVideo.usecase';
import { searchVideoUseCase } from 'src/videos/domain/usecases/searchVideo.usecase';
import { Public } from 'nest-keycloak-connect';
import { GetSuggestionsUsecase } from 'src/videos/domain/usecases/getSuggestions.usecase';
import { GetSubtitleUsecase } from 'src/videos/domain/usecases/getSubtitle.usecase';
import { CurrentUserEmail } from 'src/common/decorators/current-user-email.decorator';
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
    private getSubtitleUseCase: GetSubtitleUsecase,
    private getVideosAdminUsecase: GetVideosAdminUsecase,
    private modifyVideoUseCase: ModifyVideoUsecase,
    private searchVideoUseCase: searchVideoUseCase,
    private getSuggestionsUseCase: GetSuggestionsUsecase,
    private restoreVideoUsecase: RestoreVideoUsecase,
    //private getUsersUsecase: GetUsersUsecase,
  ) {}

  @Post()
  @UseInterceptors(AnyFilesInterceptor())
  @UsePipes(new ValidationPipe())
  async postVideo(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() video: CreateVideoDto & { media_id: string; miniature_id: string },
  ): Promise<VideoObject> {
    const videoFile = files.find((file) => file.fieldname === 'file');
    const miniatureFile = files.find((file) => file.fieldname === 'miniature');
    const subtitleFile = files.find((file) => file.fieldname === 'subtitle');
    console.log(videoFile + '\n');
    console.log(miniatureFile + '\n');
    console.log(subtitleFile + '\n');
    return await this.createNewVideoUsecase.execute(
      video,
      videoFile,
      miniatureFile,
      subtitleFile,
    );
  }

  // Standard GET route with query parameters
  @Public()
  @Get()
  @ApiOperation({
    description:
      'This request accepts query parameters in order to filter the results. Only the filter by id will expand the event field.',
  })
  findVideos(@Query() filter: any): Promise<VideoObject[]> {
    console.log('passed by');
    return this.getVideosUsecase.execute(filter);
  }

  @Public()
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
  @UseInterceptors(AnyFilesInterceptor())
  @UsePipes(new ValidationPipe({ transform: true }))
  async modifyVideo(
    @UploadedFiles() files: Array<Express.Multer.File>,
    @Body() video: ModifyVideoDto,
    @CurrentUserEmail() email: string,
  ) {
    return this.modifyVideoUseCase.execute(video, email, files);
  }

  @Delete(':id')
  async deleteVideo(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<VideoObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteVideoUsecase.execute(id, email);
  }

  @Post('/restore/:id')
  async restoreVideo(
    @Param('id') id: string,
    @CurrentUserEmail() email: string,
  ): Promise<VideoObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.restoreVideoUsecase.execute(id, email);
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

  @Get('/subtitle/:id')
  async getSubtitle(@Param('id') id: string): Promise<string | null> {
    return await this.getSubtitleUseCase.execute(id);
  }

  @Get(':userId')
  async getVideosByUser(@Param('userId') id: string): Promise<VideoObject[]> {
    const videos = await this.getVideosUsecase.execute({ creator: { id } });
    return videos;
  }

  @Get('/searchvideo/:data')
  async searchVideo(@Param('data') data: string): Promise<VideoObject[]> {
    return await this.searchVideoUseCase.execute(data);
  }

  @Get('/videoSuggestions/:id')
  async getSuggestions(@Param('id') VideoId: string): Promise<VideoObject[]> {
    return await this.getSuggestionsUseCase.execute(VideoId);
  }

  @Get('/searchvideoadmin/:data')
  async searchVideoAdmin(@Param('data') data: string): Promise<VideoObject[]> {
    return await this.searchVideoUseCase.execute(data);
  }
}
