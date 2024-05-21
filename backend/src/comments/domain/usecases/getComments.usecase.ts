import { Inject } from '@nestjs/common';
import { ICommentGateway } from '../gateways/comments.gateway';
import { CommentObject } from '../comment';

export class GetCommentsUsecase {
  constructor(
    @Inject('CommentGateway')
    private commentGateway: ICommentGateway,
  ) {}

  async execute(filter: any): Promise<CommentObject[]> {
    return await this.commentGateway.getComments(filter);
  }
}
