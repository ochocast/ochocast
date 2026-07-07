import { Inject } from '@nestjs/common';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuid } from 'uuid';
import * as path from 'path';
import { CreateVideoDto } from '../../infra/controllers/dto/create-video.dto';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { QueueService } from 'src/queue/queue.service';
import { VideoTranscodingJob } from 'src/queue/job.types';

export class CreateNewVideoUsecase {
  constructor(
    @Inject('VideoGateway') private readonly videoGateway: IVideoGateway,
    @Inject('s3Client') private readonly s3Client: S3Client,
    private readonly queueService: QueueService,
  ) {}

  async execute(
    videoToCreate: CreateVideoDto,
    file: Express.Multer.File,
    miniatureFile?: Express.Multer.File,
    subtitleFile?: Express.Multer.File,
  ): Promise<VideoObject> {
    if (!file?.buffer) {
      throw new Error('Missing video file in upload payload');
    }

    const videoId = uuid();
    const now = Date.now();
    const originalExtension =
      path
        .extname(file.originalname)
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, '') || '.video';
    const originalKey = `${videoId}/source/original${originalExtension}`;
    const miniatureSourceKey = miniatureFile
      ? `${videoId}/source/miniature-original`
      : undefined;
    const miniatureId = `miniature-${videoId}.jpg`;

    const subtitle = this.prepareSubtitle(subtitleFile, videoId);
    const creator =
      typeof videoToCreate.creator === 'string'
        ? ({ id: videoToCreate.creator } as any)
        : videoToCreate.creator;

    const video = new VideoObject(
      videoId,
      `${videoId}/master.m3u8`,
      miniatureId,
      videoToCreate.title,
      videoToCreate.description,
      videoToCreate.tags,
      creator,
      new Date(now),
      new Date(now),
      videoToCreate.internal_speakers,
      videoToCreate.external_speakers,
      0,
      [new CommentEntity(null)],
      false,
      subtitle?.id,
      undefined,
      'pending',
    );

    const uploadedObjects: Array<{ bucket: string; key: string }> = [];
    try {
      await this.upload(
        process.env.STOCK_MEDIA_BUCKET,
        originalKey,
        file.buffer,
        file.mimetype || 'application/octet-stream',
      );
      uploadedObjects.push({
        bucket: process.env.STOCK_MEDIA_BUCKET,
        key: originalKey,
      });

      if (miniatureFile && miniatureSourceKey) {
        await this.upload(
          process.env.STOCK_MINIATURE_BUCKET,
          miniatureSourceKey,
          miniatureFile.buffer,
          miniatureFile.mimetype || 'application/octet-stream',
        );
        uploadedObjects.push({
          bucket: process.env.STOCK_MINIATURE_BUCKET,
          key: miniatureSourceKey,
        });
      }

      if (subtitle) {
        await this.upload(
          process.env.STOCK_MEDIA_BUCKET,
          subtitle.sourceKey,
          subtitle.buffer,
          'text/vtt',
        );
        uploadedObjects.push({
          bucket: process.env.STOCK_MEDIA_BUCKET,
          key: subtitle.sourceKey,
        });
      }

      const savedVideo = await this.videoGateway.createNewVideo(video);
      const job: VideoTranscodingJob = {
        jobId: uuid(),
        videoId,
        originalFileName: file.originalname,
        originalKey,
        miniatureSourceKey,
        subtitleSourceKey: subtitle?.sourceKey,
        media_id: video.media_id,
        miniature_id: video.miniature_id,
        subtitle_id: video.subtitle_id,
        title: video.title,
        timestamp: now,
      };

      try {
        await this.queueService.publishJob(job);
      } catch (error) {
        const failureMessage =
          error instanceof Error ? error.message : String(error);
        video.transcoding_status = 'failed';
        video.transcoding_error = failureMessage;
        savedVideo.transcoding_status = 'failed';
        savedVideo.transcoding_error = failureMessage;
        await this.videoGateway.modifyVideo(savedVideo);
        throw error;
      }

      return savedVideo;
    } catch (error) {
      if (video.transcoding_status !== 'failed') {
        await Promise.allSettled(
          uploadedObjects.map(({ bucket, key }) =>
            this.s3Client.send(
              new DeleteObjectCommand({ Bucket: bucket, Key: key }),
            ),
          ),
        );
      }
      throw error;
    }
  }

  private async upload(
    bucket: string,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await new Upload({
      client: this.s3Client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
    }).done();
  }

  private prepareSubtitle(
    file: Express.Multer.File | undefined,
    videoId: string,
  ): { id: string; sourceKey: string; buffer: Buffer } | undefined {
    if (!file) return undefined;
    const extension = path.extname(file.originalname).toLowerCase();
    if (!['.srt', '.vtt'].includes(extension)) {
      throw new Error('Invalid subtitle format. Allowed formats: .srt, .vtt');
    }

    const decoded = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const normalized = decoded.replace(/\r\n?/g, '\n').trim();
    const vtt =
      extension === '.srt'
        ? `WEBVTT\n\n${normalized.replace(
            /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
            '$1.$2',
          )}\n`
        : normalized.startsWith('WEBVTT')
          ? `${normalized}\n`
          : `WEBVTT\n\n${normalized}\n`;
    const id = `subtitle-${videoId}.vtt`;
    return {
      id,
      sourceKey: `${videoId}/source/${id}`,
      buffer: Buffer.from(vtt, 'utf8'),
    };
  }
}
