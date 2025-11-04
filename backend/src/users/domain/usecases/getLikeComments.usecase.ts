import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';
import { CommentObject } from 'src/comments/domain/comment';

export class GetLikedCommentUsecase {
  constructor(@Inject('UserGateway') private userGateway: IUserGateway) {}

  async execute(userEmail: string): Promise<CommentObject[]> {
    return this.userGateway.getLikedComment(userEmail);
  }
}
