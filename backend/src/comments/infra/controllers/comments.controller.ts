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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentObject } from '../../domain/comment';
import { CreateNewCommentUsecase } from '../../domain/usecases/createNewComment.usecase';
import { GetCommentsUsecase } from '../../domain/usecases/getComments.usecase';
import { DeleteCommentUsecase } from 'src/comments/domain/usecases/deleteComment.usecase';
import { isUUID } from 'class-validator';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { LikeCommentsUsecase } from 'src/comments/domain/usecases/likeComment.usecase';
import { DeleteLikeCommentsUsecase } from 'src/comments/domain/usecases/deleteLikeComment.usecase';

@ApiTags('Comments')
@Controller('comments')
export class CommentsController {
  constructor(
    private createNewCommentUsecase: CreateNewCommentUsecase,
    private getCommentsUsecase: GetCommentsUsecase,
    private deleteCommentUsecase: DeleteCommentUsecase,
    private likeCommentUsecase: LikeCommentsUsecase,
    private deletelikeCommentUsecase: DeleteLikeCommentsUsecase,
  ) {}

  @Post()
  @UsePipes(new ValidationPipe())
  async createNewComment(
    @Body() comment: CreateCommentDto,
  ): Promise<CommentObject> {
    return this.createNewCommentUsecase.execute(comment);
  }

  // Standard GET route with query parameters
  @Get(':videoId')
  findComments(@Param('videoId') filter: string): Promise<CommentObject[]> {
    return this.getCommentsUsecase.execute(filter);
  }

  @Delete(':id')
  async deleteComment(@Param('id') id: string): Promise<CommentObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deleteCommentUsecase.execute(id);
  }

  @Post('like/:id')
  async like(@Param('id') id: string): Promise<CommentObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.likeCommentUsecase.execute(id);
  }

  @Delete('like/:id')
  async unlike(@Param('id') id: string): Promise<CommentObject> {
    if (!isUUID(id)) {
      throw new HttpException('Id must be an UUID', HttpStatus.BAD_REQUEST);
    }

    return await this.deletelikeCommentUsecase.execute(id);
  }
}
