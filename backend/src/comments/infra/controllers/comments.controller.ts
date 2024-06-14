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
  import { CreateCommentDto } from './dto/create-comment.dto';
  import { CommentObject } from '../../domain/comment';
  import { CreateNewCommentUsecase } from '../../domain/usecases/createNewComment.usecase';
  import { GetCommentsUsecase } from '../../domain/usecases/getComments.usecase';
  //import { UpdateCommentUsecase } from '../../domain/usecases/updateComment.usecase';
  import { DeleteCommentsUsecase } from 'src/comments/domain/usecases/deleteComment.usecase';
  import { isUUID } from 'class-validator';
  import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
  
  @ApiTags('Comments')
  @Controller('comments')
  export class CommentsController {
    constructor(
      private createNewCommentUsecase: CreateNewCommentUsecase,
      private getCommentsUsecase: GetCommentsUsecase,
      //private updateCommentUsecase: UpdateCommentUsecase,
      private deleteCommentUsecase: DeleteCommentsUsecase,
    ) {}
  
    @Post()
    @UsePipes(new ValidationPipe())
    async createNewComment(@Body() comment: CreateCommentDto): Promise<CommentObject> {
      return this.createNewCommentUsecase.execute(comment);
    }
  
    // Standard GET route with query parameters
    @Get()
    @ApiOperation({
      description:
        'This request accepts query parameters in order to filter the results. Only the filter by id will expand the creator field.',
    })
    @ApiParam({
      name: 'id',
      type: 'string',
      required: false,
      description: 'Filter comments by creator id',
    })
    findComments(@Query() filter: any): Promise<CommentObject[]> {
      return this.getCommentsUsecase.execute(filter);
    }
  
    /*@Put(':id')
    async updateComment(
      @Param('id') id: string,
      @Body() comment: CommentObject,
    ): Promise<CommentObject> {
      if (!isUUID(id)) {
        throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
      }
  
      comment.id = id;
      return this.updateCommentUsecase.execute(comment);
    }*/
  
    @Delete(':id')
    async deleteComment(@Param('id') id: string): Promise<CommentObject> {
      if (!isUUID(id)) {
        throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
      }
  
      return await this.deleteCommentUsecase.execute(id);
    }
  }
  