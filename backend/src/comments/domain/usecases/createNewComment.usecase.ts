import { Injectable, Inject } from '@nestjs/common';
import { CreateCommentDto } from '../../infra/controllers/dto/create-comment.dto';
import { ICommentGateway } from '../gateways/comments.gateway';
import { CommentObject } from '../comment';
import { v4 as uuid } from 'uuid';

@Injectable()
export class CreateNewCommentUsecase {
  constructor(
    @Inject('CommentGateway')
    private commentGateway: ICommentGateway,
  ) {}

  async execute(commentToCreate: CreateCommentDto): Promise<CommentObject> {
    const comment = new CommentObject(
      uuid(),
      commentToCreate.parentid,
      commentToCreate.creator,
      commentToCreate.video,
      commentToCreate.content,
      new Date(),
      new Date(),
      0,
    );

    await this.commentGateway.createNewComment(comment);
    return comment;
  }
}
