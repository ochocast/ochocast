import { Inject } from '@nestjs/common';
import { IVideoGateway } from '../gateways/videos.gateway';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import { extname } from 'path';
import { VIDEO_CONTENT_TYPES } from 'src/queue/transcoding-plan';
import { renditionJobId } from 'src/video-edits/domain/videoEditRenderJob';

// Public HLS assets only: retained sources and job checkpoints stay private.
const HLS_ASSET = /^[a-zA-Z0-9_-]+\.(m3u8|ts)$/;
// A rendered montage has its own path, so the year-long cache of the
// original's playlists never serves it (and the reverse).
const RENDITION_PATH = /^e-([0-9a-f-]{36})\/(.+)$/i;

// Only transcoder output is HLS. A source file (served when transcoding is
// disabled or the video was too long to transcode) keeps a presigned URL, even
// if it is named .m3u8 or .ts.
const isHls = (mediaId: string) => mediaId.endsWith('/master.m3u8');

// The browser fetches a source by byte ranges from this one URL for the whole
// playback: twice the duration plus an hour leaves room for pauses and seeks.
// A source published without transcoding (a long recording) has no known
// duration. SigV4 rejects a presigned URL valid for more than 7 days.
const SOURCE_URL_MARGIN_SECONDS = 3600;
const SOURCE_URL_UNKNOWN_DURATION_SECONDS = 24 * 3600;
const SOURCE_URL_MAX_SECONDS = 7 * 24 * 3600;
const sourceUrlExpiry = (duration?: number | null): number =>
  typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? Math.min(
        SOURCE_URL_MAX_SECONDS,
        2 * Math.ceil(duration) + SOURCE_URL_MARGIN_SECONDS,
      )
    : SOURCE_URL_UNKNOWN_DURATION_SECONDS;

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

    // Viewers get the rendered montage, and keep the previous one while a
    // new render runs; going back to the original clears it.
    const renditionId = renditionJobId(
      id,
      await this.videoGateway.getRenderedMediaId(id),
    );
    if (renditionId) {
      if (!apiBaseUrl)
        throw new Error('API base URL is required for HLS media');
      return `${apiBaseUrl}/videos/media-content/${id}/e-${renditionId}/master.m3u8`;
    }

    if (isHls(videos[0].media_id)) {
      if (!apiBaseUrl)
        throw new Error('API base URL is required for HLS media');
      return `${apiBaseUrl}/videos/media-content/${id}/master.m3u8`;
    }

    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: videos[0].media_id,
      // Never the stored type, which older sources took from the client.
      ResponseContentType:
        VIDEO_CONTENT_TYPES.get(
          extname(videos[0].media_id).slice(1).toLowerCase(),
        ) || 'application/octet-stream',
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: sourceUrlExpiry(videos[0].duration),
    });
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

    let normalizedPath = requestedPath.replace(/^\/+/, '');
    let mediaPrefix: string;
    const rendition = RENDITION_PATH.exec(normalizedPath);
    if (rendition) {
      // Only the rendition viewers get: a replaced or reverted one is gone.
      const active = renditionJobId(
        id,
        await this.videoGateway.getRenderedMediaId(id),
      );
      if (!active || active.toLowerCase() !== rendition[1].toLowerCase()) {
        throw new NotFoundException('Media is not available');
      }
      mediaPrefix = `${id}/edits/${active}/`;
      normalizedPath = rendition[2];
    } else {
      if (!isHls(videos[0].media_id)) {
        throw new NotFoundException('Media is not available');
      }
      mediaPrefix = videos[0].media_id.slice(
        0,
        videos[0].media_id.lastIndexOf('/') + 1,
      );
    }
    if (
      !normalizedPath ||
      normalizedPath.includes('..') ||
      !HLS_ASSET.test(normalizedPath)
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
