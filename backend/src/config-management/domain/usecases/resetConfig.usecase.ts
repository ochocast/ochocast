import { Inject, Injectable, ForbiddenException } from '@nestjs/common';
import { IConfigGateway } from '../gateways/config.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

@Injectable()
export class ResetConfigUsecase {
  constructor(
    @Inject('ConfigGateway') private configGateway: IConfigGateway,
    @Inject('UserGateway') private userGateway: IUserGateway,
  ) {}

  async execute(currentUserEmail: string): Promise<{ message: string }> {
    // Vérifier que l'utilisateur est admin
    const user = await this.userGateway.getUserByEmail(currentUserEmail);
    if (!user) {
      throw new ForbiddenException('User not found');
    }

    if (user.role !== 'admin') {
      throw new ForbiddenException(
        'Only administrators can reset config files',
      );
    }

    // Supprimer tous les fichiers de configuration
    await this.configGateway.deleteAllConfigFiles();

    return { message: 'Configuration reset successfully' };
  }
}
