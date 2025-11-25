import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export class GetSubtitleUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(id: any): Promise<string | null> {
    console.log('GetSubtitle - Video ID:', id);
    const videos = await this.videoGateway.getVideos({ id: id });
    console.log('GetSubtitle - Video found:', videos ? videos.length : 0);

    if (!videos || videos.length === 0) {
      console.log('GetSubtitle - No video found');
      return null;
    }

    if (!videos[0].subtitle_id) {
      console.log(
        'GetSubtitle - Video has no subtitle_id:',
        videos[0].subtitle_id,
      );
      return null;
    }

    console.log('GetSubtitle - Subtitle ID:', videos[0].subtitle_id);

    // Determine Content-Type based on file extension
    const isVtt = videos[0].subtitle_id.endsWith('.vtt');
    const contentType = isVtt ? 'text/vtt' : 'application/x-subrip';

    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: videos[0].subtitle_id,
      ResponseContentType: contentType,
      ResponseContentDisposition: 'inline',
    });

    // Generate a signed URL valid for a limited time (e.g., 1 hour)
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    console.log('GetSubtitle - Generated URL:', url);
    return url;
  }
}
