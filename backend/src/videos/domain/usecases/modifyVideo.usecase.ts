import {
  Inject,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { parseVideoLists } from '../videoLists';
import { ModifyVideoDto } from 'src/videos/infra/controllers/dto/modify-video.dto';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import type { Express } from 'express';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import sharp = require('sharp');

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

    // Checked before anything is uploaded or saved, with the upload's limits.
    const lists = parseVideoLists(video.tags, video.internal_speakers);

    // Gérer un éventuel nouveau fichier de miniature
    const miniatureFile = files?.find((file) => file.fieldname === 'miniature');
    let miniature_id: string | undefined;

    if (miniatureFile) {
      miniature_id = `miniature${Date.now()}.jpg`;

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
    }

    // Only what the settings form edits. The rest belongs to the uploads, the
    // transcoding pipeline or other routes: the form echoes the values its
    // page loaded (a stale media_id would undo the source fallback, a forged
    // key would be presigned), and views, dates or the creator are not its to
    // change. A replaced miniature gets the key this use case uploaded.
    return await this.videoGateway.modifyVideo({
      id: existing.id,
      title: video.title,
      description: video.description,
      // Raw entries, resolved against stored rows by the gateway; a list the
      // form leaves out keeps the stored one.
      ...(video.tags !== undefined
        ? { tags: lists.tags as VideoObject['tags'] }
        : {}),
      ...(video.internal_speakers !== undefined
        ? {
            internal_speakers:
              lists.speakers as VideoObject['internal_speakers'],
          }
        : {}),
      external_speakers: video.external_speakers,
      updatedAt: new Date(),
      ...(miniature_id ? { miniature_id } : {}),
    });
  }
}
