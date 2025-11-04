import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';

export class RemoveLikedCommentUsecase {
  constructor(@Inject('UserGateway') private userGateway: IUserGateway) {}

  async execute(userEmail: string, commentId: string): Promise<void> {
    const user = await this.userGateway.getUserByEmail(userEmail);
    if (!user) throw new Error('User not found');
    await this.userGateway.removeLikedComment(user.id, commentId);
  }
}
