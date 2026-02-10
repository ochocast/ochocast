import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
// import logger from '@utils/logger';

export class GetMiniatureUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(id: any): Promise<string> {
    const videos = await this.videoGateway.getVideos({ id: id });

    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_MINIATURE_BUCKET,
      Key: videos[0].miniature_id,
    });

    // Generate a signed URL valid for 1 hour
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });

    return url;
  }
}
