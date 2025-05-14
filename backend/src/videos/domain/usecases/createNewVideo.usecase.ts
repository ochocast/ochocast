import { CreateVideoDto } from '../../infra/controllers/dto/create-video.dto';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { Upload } from '@aws-sdk/lib-storage';
import * as ffmpeg from 'fluent-ffmpeg';
import * as ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import * as path from 'path';
import { tmpdir } from 'os';
import * as sharp from 'sharp';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export class CreateNewVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(
    videoToCreate: CreateVideoDto,
    file: Express.Multer.File,
    miniatureFile: Express.Multer.File,
  ): Promise<VideoObject> {
    const media_id = Date.now() + '.' + videoToCreate.media_id;
    const miniature_id = `miniature${Date.now()}.jpg`;
    const video = new VideoObject(
      uuid(),
      media_id,
      miniature_id,
      videoToCreate.title,
      videoToCreate.description,
      videoToCreate.tags,
      videoToCreate.creator,
      new Date(Date.now()),
      new Date(Date.now()),
      videoToCreate.internal_speakers,
      videoToCreate.external_speakers,
      0,
      [new CommentEntity(null)],
      false,
    );

    const tempInputPath = path.join(tmpdir(), `${video.media_id}-input`);
    const tempOutputPath = path.join(
      tmpdir(),
      `${video.media_id}-transcoded.mp4`,
    );
    await writeFile(tempInputPath, file.buffer);

    await transcodeVideo(tempInputPath, tempOutputPath);

    const transcodedBuffer = await readFile(tempOutputPath);

    const upload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: video.media_id,
        Body: transcodedBuffer,
        ContentType: 'video/mp4',
      },
    });

    const video_result = await upload.done();
    if (miniatureFile) {
      const tempMiniaturePath = path.join(tmpdir(),`miniature${video.media_id}.jpg`);
      await sharp(miniatureFile.buffer)
        .resize(1280, 720)
        .jpeg({ quality: 80 })
        .toFile(tempMiniaturePath);

      const miniatureUpload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: process.env.STOCK_MINIATURE_BUCKET,
          Key: video.miniature_id,
          Body: await readFile(tempMiniaturePath),
          ContentType: 'image/jpeg',
        },
      });
      const miniature_result = await miniatureUpload.done();
      await unlink(tempMiniaturePath).catch(() => {});
    }

    await unlink(tempInputPath).catch(() => {});
    await unlink(tempOutputPath).catch(() => {});

    await this.videoGateway.createNewVideo(video);
    return video;
  }
}

async function transcodeVideo(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .outputOptions(['-preset fast', '-crf 23', '-movflags +faststart'])
      .format('mp4')
      .on('end', () => {
        resolve();
      })
      .on('error', (err) => {
        console.error('Erreur lors du transcodage :', err);
        reject(err);
      })
      .save(outputPath);
  });
}
