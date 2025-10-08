import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { ModifyVideoDto } from 'src/videos/infra/controllers/dto/modify-video.dto';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
export class ModifyVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(video: ModifyVideoDto, email: string): Promise<VideoObject> {
    const user = await this.userGateway.getUserByEmail(email);
    if (!user) throw new NotFoundException(`User (email: ${email}) not found`);

    const videos = await this.videoGateway.getVideos({ id: video.id });
    if (!videos || videos.length === 0)
      throw new NotFoundException(`Video (id: ${video.id}) not found`);
    const existing = videos[0];

    if (!existing.creator || existing.creator.email !== user.email) {
      throw new UnauthorizedException('videonotallowmodify');
    }

    video.updatedAt = new Date();
    video.createdAt = new Date(JSON.parse(video.createdAt.toString()));
    video.comments = JSON.parse(video.comments.toString());
    video.tags = JSON.parse(video.tags.toString());
    video.internal_speakers = JSON.parse(video.internal_speakers.toString());
    return await this.videoGateway.modifyVideo(video);
  }
}
