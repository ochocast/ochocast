import { Inject } from '@nestjs/common';
import { IUserGateway } from '../gateways/users.gateway';
import { VideoObject } from 'src/videos/domain/video';

export class GetFavoriteVideosUsecase {
  constructor(@Inject('UserGateway') private userGateway: IUserGateway) {}

  async execute(userEmail: string): Promise<VideoObject[]> {
    return this.userGateway.getFavoriteVideos(userEmail);
  }
}
