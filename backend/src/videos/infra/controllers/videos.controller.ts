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
  import { CreateVideoDto } from './dto/create-video.dto';
  import { CreateNewVideoUsecase } from '../../domain/usecases/createNewVideo.usecase';
  import { GetVideosUsecase } from '../../domain/usecases/getVideos.usecase';
  import { isUUID } from 'class-validator';
  // import { UpdateVideoUsecase } from '../../domain/usecases/updateVideo.usecase';
  import { VideoObject } from '../../domain/video';
  import { DeleteVideoUsecase } from '../../domain/usecases/deleteVideo.usecase';
  import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
  
  @ApiTags('Videos')
  @Controller('videos')
  export class VideosController {
    constructor(
      private createNewVideoUsecase: CreateNewVideoUsecase,
      private getVideosUsecase: GetVideosUsecase,
      private deleteVideosUsecase: DeleteVideoUsecase,
    ) {}
  
    @Post()
    @UsePipes(new ValidationPipe())
    async postVideo(@Body() video: CreateVideoDto): Promise<VideoObject> {
      return await this.createNewVideoUsecase.execute(video);
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
      description: 'Filter videos by id',
    })
    findVideos(@Query() filter: any): Promise<VideoObject[]> {
      return this.getVideosUsecase.execute(filter);
    }
  
    @Delete(':id')
    async deleteVideo(@Param('id') id: string): Promise<VideoObject> {
      if (!isUUID(id)) {
        throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
      }
  
      return await this.deleteVideosUsecase.execute(id);
    }
  }
  