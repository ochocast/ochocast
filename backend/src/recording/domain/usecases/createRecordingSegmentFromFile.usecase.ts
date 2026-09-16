import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuid } from 'uuid';
import * as path from 'path';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { RecordingObject } from '../recording';

export interface CreateRecordingSegmentFromFileOptions {
  problematic?: boolean;
  duration?: number | null;
}

/**
 * Raccordement — Store an uploaded recording segment file and register it as an
 * `unlisted` segment of the track.
 *
 * This is what the recorder now calls (multipart file) instead of the old
 * direct-publish flow. The raw file is stored as-is (no transcoding yet — that
 * happens at merge/publish time); only the storage key is kept as `media_id`.
 */
@Injectable()
export class CreateRecordingSegmentFromFileUsecase {
  constructor(
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('s3Client')
    private readonly s3Client: S3Client,
  ) {}

  async execute(
    trackId: string,
    file: Express.Multer.File,
    options: CreateRecordingSegmentFromFileOptions = {},
  ): Promise<RecordingObject> {
    if (!file?.buffer) {
      throw new Error('Missing recording segment file in upload payload');
    }

    const tracks = await this.trackGateway.getTracks({ id: trackId });
    if (!tracks || tracks.length === 0) {
      throw new NotFoundException(`Track not found: ${trackId}`);
    }

    const segmentId = uuid();
    const extension =
      path
        .extname(file.originalname || '')
        .toLowerCase()
        .replace(/[^.a-z0-9]/g, '') || '.mp4';
    const key = `recordings/${trackId}/${segmentId}/original${extension}`;

    await new Upload({
      client: this.s3Client,
      params: {
        Bucket: process.env.STOCK_MEDIA_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype || 'video/mp4',
      },
    }).done();

    const segmentIndex =
      await this.recordingRepository.countRecordingsByTrack(trackId);

    const recording = new RecordingObject(
      segmentId,
      trackId,
      key,
      'unlisted',
      options.problematic ?? false,
      segmentIndex,
      options.duration ?? null,
      new Date(),
    );

    return this.recordingRepository.createRecording(recording);
  }
}
