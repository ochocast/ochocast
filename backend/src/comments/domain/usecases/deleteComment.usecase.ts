import { Inject } from '@nestjs/common';
import { ICommentGateway } from '../gateways/comments.gateway';
import { CommentObject } from '../comment';

export class DeleteCommentUsecase {
  constructor(
    @Inject('CommentGateway')
    private commentGateway: ICommentGateway,
  ) {}

  async execute(id: string): Promise<CommentObject> {
    return await this.commentGateway.deleteComment(id);
  }
}
