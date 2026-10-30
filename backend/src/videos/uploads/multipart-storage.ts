import { Inject, Injectable } from '@nestjs/common';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  UploadPartCopyCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { VIDEO_CONTENT_TYPES } from 'src/queue/transcoding-plan';
import { VideoUpload } from './upload.entity';

export interface StoredPart {
  PartNumber: number;
  ETag: string;
  Size: number;
  ChecksumSHA256?: string;
}
export abstract class MultipartStorage {
  abstract create(s: VideoUpload): Promise<string>;
  abstract sign(
    s: VideoUpload,
    part: number,
    checksum: string,
  ): Promise<string>;
  abstract parts(s: VideoUpload): Promise<StoredPart[]>;
  abstract complete(s: VideoUpload, parts: StoredPart[]): Promise<void>;
  abstract head(s: VideoUpload): Promise<{ size: number; session: string }>;
  /** Size of a file of the media bucket. */
  abstract size(key: string): Promise<number>;
  /** Copies bytes first..last of a media bucket file as a part; returns its ETag. */
  abstract copyPart(
    s: VideoUpload,
    part: number,
    sourceKey: string,
    first: number,
    last: number,
  ): Promise<string>;
  abstract abort(s: VideoUpload): Promise<void>;
  abstract remove(s: VideoUpload): Promise<void>;
  abstract put(
    bucket: string,
    key: string,
    body: Buffer,
    type: string,
  ): Promise<void>;
}
@Injectable()
export class S3MultipartStorage extends MultipartStorage {
  constructor(@Inject('s3Client') private readonly client: S3Client) {
    super();
  }
  private ref(s: VideoUpload) {
    return {
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: s.key,
      UploadId: s.uploadId,
    };
  }
  async create(s: VideoUpload) {
    const extension = s.filename.split('.').pop()?.toLowerCase();
    const r = await this.client.send(
      new CreateMultipartUploadCommand({
        ...this.ref(s),
        ContentType:
          VIDEO_CONTENT_TYPES.get(extension || '') ||
          'application/octet-stream',
        Metadata: { session: s.id },
        ...(s.checksumMode === 'sha256'
          ? { ChecksumAlgorithm: 'SHA256' as const }
          : {}),
      }),
    );
    if (!r.UploadId) throw new Error('Storage did not return an upload ID');
    return r.UploadId;
  }
  async sign(s: VideoUpload, part: number, checksum: string) {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        ...this.ref(s),
        PartNumber: part,
        ...(s.checksumMode === 'sha256' ? { ChecksumSHA256: checksum } : {}),
      }),
      {
        expiresIn: 900,
        unhoistableHeaders: new Set(['x-amz-checksum-sha256']),
      },
    );
  }
  async parts(s: VideoUpload): Promise<StoredPart[]> {
    const parts: StoredPart[] = [];
    let marker: string | undefined;
    do {
      const r = await this.client.send(
        new ListPartsCommand({ ...this.ref(s), PartNumberMarker: marker }),
      );
      parts.push(...((r.Parts || []) as StoredPart[]));
      marker = r.IsTruncated ? r.NextPartNumberMarker : undefined;
    } while (marker);
    return parts.sort((a, b) => a.PartNumber - b.PartNumber);
  }
  async complete(s: VideoUpload, parts: StoredPart[]) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        ...this.ref(s),
        MultipartUpload: {
          Parts: parts.map(({ PartNumber, ETag, ChecksumSHA256 }) => ({
            PartNumber,
            ETag,
            ...(s.checksumMode === 'sha256' ? { ChecksumSHA256 } : {}),
          })),
        },
      }),
    );
  }
  async head(s: VideoUpload) {
    const r = await this.client.send(new HeadObjectCommand(this.ref(s)));
    return { size: r.ContentLength, session: r.Metadata?.session };
  }
  async size(key: string) {
    const r = await this.client.send(
      new HeadObjectCommand({
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: key,
      }),
    );
    if (!r.ContentLength) throw new Error(`Empty or missing media: ${key}`);
    return r.ContentLength;
  }
  async copyPart(
    s: VideoUpload,
    part: number,
    sourceKey: string,
    first: number,
    last: number,
  ) {
    const r = await this.client.send(
      new UploadPartCopyCommand({
        ...this.ref(s),
        PartNumber: part,
        CopySource: `${process.env.STOCK_MEDIA_BUCKET}/${sourceKey
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`,
        CopySourceRange: `bytes=${first}-${last}`,
      }),
    );
    if (!r.CopyPartResult?.ETag)
      throw new Error('Storage did not return a copied part ETag');
    return r.CopyPartResult.ETag;
  }
  async abort(s: VideoUpload) {
    if (!s.uploadId) return;
    try {
      await this.client.send(new AbortMultipartUploadCommand(this.ref(s)));
    } catch (e) {
      if (e.name !== 'NoSuchUpload') throw e;
    }
  }
  async remove(s: VideoUpload) {
    for (const [Bucket, Key] of [
      [process.env.STOCK_MEDIA_BUCKET, s.key],
      [process.env.STOCK_MEDIA_BUCKET, `subtitle-${s.id}.vtt`],
      [process.env.STOCK_MEDIA_BUCKET, `${s.id}/source/subtitle-${s.id}.vtt`],
      [process.env.STOCK_MINIATURE_BUCKET, `${s.id}/source/miniature-original`],
      [process.env.STOCK_MINIATURE_BUCKET, `miniature-${s.id}.jpg`],
    ])
      await this.client.send(new DeleteObjectCommand({ Bucket, Key }));
  }
  async put(bucket: string, key: string, body: Buffer, type: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: type,
      }),
    );
  }
}
