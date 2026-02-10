import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { ModifyVideoDto } from 'src/videos/infra/controllers/dto/modify-video.dto';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import type { Express } from 'express';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import * as sharp from 'sharp';
export class ModifyVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(
    video: ModifyVideoDto,
    email: string,
    files?: Array<Express.Multer.File>,
  ): Promise<VideoObject> {
    const user = await this.userGateway.getUserByEmail(email);
    if (!user) throw new NotFoundException(`User (email: ${email}) not found`);

    const videos = await this.videoGateway.getVideos({ id: video.id });
    if (!videos || videos.length === 0)
      throw new NotFoundException(`Video (id: ${video.id}) not found`);
    const existing = videos[0];

    if (!existing.creator || existing.creator.email !== user.email) {
      throw new UnauthorizedException('videonotallowmodify');
    }

    // Gérer un éventuel nouveau fichier de miniature
    const miniatureFile = files?.find((file) => file.fieldname === 'miniature');

    if (miniatureFile) {
      const miniature_id = `miniature${Date.now()}.jpg`;

      // Redimensionner/comprimer la miniature comme lors de la création
      const processedBuffer = await sharp(miniatureFile.buffer)
        .resize(1280, 720, {
          fit: 'cover',
          position: 'center',
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const miniatureUpload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: process.env.STOCK_MINIATURE_BUCKET as string,
          Key: miniature_id,
          Body: processedBuffer,
          ContentType: 'image/jpeg',
        },
      });

      await miniatureUpload.done();

      // Met à jour l'id de miniature pour cette vidéo
      video.miniature_id = miniature_id;
    }

    video.updatedAt = new Date();
    video.createdAt = new Date(JSON.parse(video.createdAt.toString()));
    video.comments = JSON.parse(video.comments.toString());
    video.tags = JSON.parse(video.tags.toString());
    video.internal_speakers = JSON.parse(video.internal_speakers.toString());
    return await this.videoGateway.modifyVideo(video);
  }
}
