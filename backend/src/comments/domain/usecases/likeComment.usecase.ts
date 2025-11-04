import { Inject } from '@nestjs/common';
import { ICommentGateway } from '../gateways/comments.gateway';
import { CommentObject } from '../comment';

export class LikeCommentsUsecase {
  constructor(
    @Inject('CommentGateway')
    private commentGateway: ICommentGateway,
  ) {}

  async execute(id: string): Promise<CommentObject> {
    return await this.commentGateway.likeComment(id);
  }
}
