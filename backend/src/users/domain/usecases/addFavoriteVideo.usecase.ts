import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';

export class AddFavoriteVideoUsecase {
  constructor(@Inject('UserGateway') private userGateway: IUserGateway) {}

  async execute(userEmail: string, videoId: string): Promise<void> {
    const user = await this.userGateway.getUserByEmail(userEmail);
    if (!user) throw new Error('User not found');
    await this.userGateway.addFavoriteVideo(user.id, videoId);
  }
}
