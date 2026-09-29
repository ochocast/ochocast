import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';

export class GetMediaUsecase {
  constructor(
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('s3Client')
    private s3Client: S3Client,
  ) {}

  async execute(id: string, apiBaseUrl?: string): Promise<string> {
    const videos = await this.videoGateway.getVideos({ id: id });

    if (!videos.length) throw new NotFoundException('Video not found');
    if (videos[0].transcoding_status === 'pending') {
      throw new NotFoundException('Video transcoding is still pending');
    }
    if (videos[0].transcoding_status === 'failed') {
      throw new NotFoundException('Video transcoding failed');
    }

    if (videos[0].media_id.endsWith('.m3u8')) {
      if (!apiBaseUrl)
        throw new Error('API base URL is required for HLS media');
      return `${apiBaseUrl}/videos/media-content/${id}/master.m3u8`;
    }

    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: videos[0].media_id,
    });

    // Générer une URL signée valable pour une durée limitée (par exemple 1 heure)
    const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    console.log(url);
    return url;
  }

  async getContent(
    id: string,
    requestedPath: string,
  ): Promise<{
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
  }> {
    const videos = await this.videoGateway.getVideos({ id });
    if (!videos.length || videos[0].transcoding_status !== 'ready') {
      throw new NotFoundException('Media is not available');
    }

    const mediaPrefix = videos[0].media_id.slice(
      0,
      videos[0].media_id.lastIndexOf('/') + 1,
    );
    const normalizedPath = requestedPath.replace(/^\/+/, '');
    if (
      !normalizedPath ||
      normalizedPath.includes('..') ||
      !/^[a-zA-Z0-9._/-]+$/.test(normalizedPath)
    ) {
      throw new NotFoundException('Invalid media path');
    }

    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: `${mediaPrefix}${normalizedPath}`,
      }),
    );
    if (!response.Body) throw new NotFoundException('Media object not found');

    return {
      body: await response.Body.transformToByteArray(),
      contentType:
        response.ContentType ||
        (normalizedPath.endsWith('.m3u8')
          ? 'application/vnd.apple.mpegurl'
          : 'video/mp2t'),
      cacheControl: response.CacheControl,
    };
  }
}
