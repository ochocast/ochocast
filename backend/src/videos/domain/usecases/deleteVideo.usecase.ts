import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

@Injectable()
export class DeleteVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(id: string, email: string): Promise<VideoObject> {
    const user = await this.userGateway.getUserByEmail(email);
    if (!user) throw new NotFoundException(`User (email: ${email}) not found`);

    const videos = await this.videoGateway.getVideos({ id });
    if (!videos || videos.length === 0)
      throw new NotFoundException(`Video (id: ${id}) not found`);
    const video = videos[0];

    if (
      (!video.creator || video.creator.email !== user.email) &&
      user.role !== 'admin'
    ) {
      throw new UnauthorizedException('videonotallowdeleted');
    }

    return await this.videoGateway.deleteVideo(id);
  }
}
