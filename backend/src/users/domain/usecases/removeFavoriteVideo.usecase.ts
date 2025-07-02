import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';

export class RemoveFavoriteVideoUsecase {
  constructor(@Inject('UserGateway') private userGateway: IUserGateway) {}

  async execute(userEmail: string, videoId: string): Promise<void> {
    const user = await this.userGateway.getUserByEmail(userEmail);
    if (!user) throw new Error('User not found');
    await this.userGateway.removeFavoriteVideo(user.id, videoId);
  }
}
