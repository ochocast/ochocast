import { CreateVideoDto } from '../../infra/controllers/dto/create-video.dto';
import { IVideoGateway } from '../gateways/videos.gateway';
import { VideoObject } from '../video';
import { v4 as uuid } from 'uuid';
import { Inject } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { CommentEntity } from 'src/comments/infra/gateways/entities/comment.entity';
import { Upload } from '@aws-sdk/lib-storage';
import * as path from 'path';
import { QueueService } from 'src/queue/queue.service';
import { VideoTranscodingJob } from 'src/queue/job.types';

export class CreateNewVideoUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
    private queueService: QueueService,
  ) {}

  async execute(
    videoToCreate: CreateVideoDto,
    file: Express.Multer.File,
    miniatureFile?: Express.Multer.File,
    subtitleFile?: Express.Multer.File,
  ): Promise<VideoObject> {
    const videoId = uuid();
    const baseName = path.parse(videoToCreate.media_id).name;

    // Generate IDs for final files (HLS will be in a folder structure)
    const media_id = `${videoId}/master.m3u8`; // HLS master playlist
    const miniature_id = miniatureFile
      ? `miniature${Date.now()}.jpg`
      : undefined;
    let subtitle_id: string | undefined;

    // Handle subtitle file conversion if provided
    let subtitleBuffer: Buffer | undefined;
    if (subtitleFile) {
      const allowedExtensions = ['.srt', '.vtt'];
      const subtitleExtension = path
        .extname(subtitleFile.originalname)
        .toLowerCase();

      if (!allowedExtensions.includes(subtitleExtension)) {
        throw new Error(
          `Invalid subtitle format. Allowed formats: ${allowedExtensions.join(', ')}`,
        );
      }

      // Validate UTF-8 encoding and convert SRT to VTT if needed
      try {
        const decoded = subtitleFile.buffer.toString('utf-8');
        if (subtitleExtension === '.srt') {
          const converted = convertSrtToVtt(decoded);
          subtitleBuffer = Buffer.from(converted, 'utf-8');
        } else {
          const normalized = decoded.trim();
          if (!normalized.startsWith('WEBVTT')) {
            subtitleBuffer = Buffer.from('WEBVTT\n\n' + normalized, 'utf-8');
          } else {
            subtitleBuffer = Buffer.from(normalized, 'utf-8');
          }
        }
        subtitle_id = `subtitle${Date.now()}.vtt`;
      } catch (error) {
        throw new Error('Subtitle file must be encoded in UTF-8');
      }
    }

    // Create video object with pending status
    const video = new VideoObject(
      videoId,
      media_id,
      miniature_id || `miniature${Date.now()}.jpg`, // Default miniature will be generated
      videoToCreate.title,
      videoToCreate.description,
      videoToCreate.tags,
      videoToCreate.creator,
      new Date(Date.now()),
      new Date(Date.now()),
      videoToCreate.internal_speakers,
      videoToCreate.external_speakers,
      0, // Duration will be set by the worker
      [new CommentEntity(null)],
      false,
      subtitle_id,
    );

    // Upload original video to S3 location for processing
    const tempVideoKey = `${videoId}/original.mp4`;
    const videoUpload = new Upload({
      client: this.s3Client,
      params: {
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: tempVideoKey,
        Body: file.buffer,
        ContentType: 'video/mp4',
      },
    });
    await videoUpload.done();
    console.log(`Original video uploaded to temp: ${tempVideoKey}`);

    // Upload temporary miniature if provided
    if (miniatureFile) {
      const tempMiniatureKey = `${videoId}/miniature-original.jpg`;
      const miniatureUpload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: process.env.STOCK_MINIATURE_BUCKET,
          Key: tempMiniatureKey,
          Body: miniatureFile.buffer,
          ContentType: 'image/jpeg',
        },
      });
      await miniatureUpload.done();
      console.log(`Original miniature uploaded: ${tempMiniatureKey}`);
    }

    // Upload subtitle to temp if provided
    if (subtitleBuffer && subtitle_id) {
      const tempSubtitleKey = `${videoId}/${subtitle_id}`;
      const subtitleUpload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: process.env.STOCK_MEDIA_BUCKET,
          Key: tempSubtitleKey,
          Body: subtitleBuffer,
          ContentType: 'text/vtt',
        },
      });
      await subtitleUpload.done();
      console.log(`Subtitle uploaded: ${tempSubtitleKey}`);
    }

    // Publish job to RabbitMQ queue
    const jobId = uuid();
    const job: VideoTranscodingJob = {
      jobId,
      videoId,
      originalFileName: file.originalname,
      media_id: video.media_id,
      miniature_id: video.miniature_id,
      subtitle_id: video.subtitle_id,
      title: videoToCreate.title,
      description: videoToCreate.description,
      tags: Array.isArray(videoToCreate.tags)
        ? videoToCreate.tags.map((tag) =>
            typeof tag === 'string' ? tag : tag.name,
          )
        : [],
      creator:
        typeof videoToCreate.creator === 'string'
          ? videoToCreate.creator
          : videoToCreate.creator.id,
      internal_speakers: Array.isArray(videoToCreate.internal_speakers)
        ? videoToCreate.internal_speakers.map((speaker) =>
            typeof speaker === 'string' ? speaker : speaker.id,
          )
        : [],
      external_speakers:
        typeof videoToCreate.external_speakers === 'string'
          ? [videoToCreate.external_speakers]
          : Array.isArray(videoToCreate.external_speakers)
            ? videoToCreate.external_speakers
            : [],
      timestamp: Date.now(),
    };

    await this.queueService.publishJob(job);
    console.log(`Transcoding job published: ${jobId}`);

    // Save video to database (with pending status)
    await this.videoGateway.createNewVideo(video);

    return video;
  }
}

/**
 * Simple SRT -> WebVTT converter.
 */
function convertSrtToVtt(srt: string): string {
  const normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const convertedTimestamps = normalized.replace(
    /(\d{2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2',
  );
  if (!/^WEBVTT/m.test(convertedTimestamps)) {
    return 'WEBVTT\n\n' + convertedTimestamps.trim() + '\n';
  }
  return convertedTimestamps;
}
