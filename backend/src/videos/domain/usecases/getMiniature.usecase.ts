import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
// import logger from '@utils/logger';

export class GetMiniatureUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(id: string): Promise<string | null> {
    const videos = await this.videoGateway.getVideos({ id });
    if (!videos.length) throw new NotFoundException('Video not found');

    const Bucket = process.env.STOCK_MINIATURE_BUCKET;
    const Key = videos[0].miniature_id;
    try {
      await this.s3Client.send(new HeadObjectCommand({ Bucket, Key }));
    } catch (error) {
      if (
        error?.name === 'NotFound' ||
        error?.name === 'NoSuchKey' ||
        error?.$metadata?.httpStatusCode === 404
      ) {
        return null;
      }
      throw error;
    }

    const command = new GetObjectCommand({
      Bucket,
      Key,
    });

    // Generate a signed URL valid for 1 hour
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });

    return url;
  }
}
