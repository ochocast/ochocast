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
import { CreateTagDto } from './dto/create-tag.dto';
import { CreateNewTagUsecase } from '../../domain/usecases/createNewTag.usecase';
import { GetTagsUsecase } from '../../domain/usecases/getTags.usecase';
import { isUUID } from 'class-validator';
// import { UpdateTagUsecase } from '../../domain/usecases/updateTag.usecase';
import { TagObject } from '../../domain/tag';
import { DeleteTagUsecase } from '../../domain/usecases/deleteTag.usecase';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { GetListTagsUsecase } from 'src/tags/domain/usecases/getListTags.usecase';

@ApiTags('Tags')
@Controller('tags')
export class TagsController {
  constructor(
    private createNewTagUsecase: CreateNewTagUsecase,
    private getTagsUsecase: GetTagsUsecase,
    private deleteTagsUsecase: DeleteTagUsecase,
    private getListTagsUsecase: GetListTagsUsecase,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async postTag(@Body() tag: CreateTagDto): Promise<TagObject> {
    return await this.createNewTagUsecase.execute(tag);
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
    description: 'Filter tags by id',
  })
  findTags(@Query() filter: any): Promise<TagObject[]> {
    return this.getTagsUsecase.execute(filter);
  }

  @Get('/find')
  findListTags(@Query() filter: any): Promise<TagObject[]> {
    return this.getListTagsUsecase.execute(filter);
  }

  @Delete(':id')
  async deleteTag(@Param('id') id: string): Promise<TagObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteTagsUsecase.execute(id);
  }
}
