import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export class GetMediaUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(id: any): Promise<string> {
    const videos = await this.videoGateway.getVideos({ id: id });

    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: videos[0].media_id,
    });

    // Générer une URL signée valable pour une durée limitée (par exemple 1 heure)
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    console.log(url);
    return url;
  }
}
