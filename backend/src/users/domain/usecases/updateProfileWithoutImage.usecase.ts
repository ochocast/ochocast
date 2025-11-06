import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';
import { UpdateUserDto } from 'src/users/infra/controllers/dto/update-user.dto';

export class UpdateProfileUseCaseWithoutImage {
  constructor(@Inject('UserGateway') private userGateway: IUserGateway) {}

  async execute(userEmail: string, newProfile: UpdateUserDto): Promise<void> {
    const user = await this.userGateway.getUserByEmail(userEmail);
    if (!user) throw new Error('User not found');

    await this.userGateway.updateUserProfile(
      user.id,
      newProfile.username,
      newProfile.description,
      newProfile.picture_id,
    );
  }
}
