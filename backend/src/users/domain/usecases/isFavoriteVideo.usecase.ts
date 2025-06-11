import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';

export class IsFavoriteVideoUsecase {
  constructor(@Inject('UserGateway') private userGateway: IUserGateway) {}

  async execute(userEmail: string, videoId: string): Promise<boolean> {
    const user = await this.userGateway.getUserByEmail(userEmail);
    if (!user) throw new Error('User not found');
    return await this.userGateway.isVideoFavorite(user.id, videoId);
  }
}
