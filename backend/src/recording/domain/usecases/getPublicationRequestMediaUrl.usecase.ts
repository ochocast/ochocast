import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { assertPending } from '../publicationRequestAccess';
import { GetPublicationRequestUsecase } from './getPublicationRequest.usecase';

// Short-lived: only used to preview / preload the proposed video.
const PRESIGNED_URL_TTL_SECONDS = 300;

/**
 * US-6 — Temporary read access to the proposed video, for the targeted
 * speaker (or the requester) while the request is pending.
 */
@Injectable()
export class GetPublicationRequestMediaUrlUsecase {
  constructor(
    private getPublicationRequestUsecase: GetPublicationRequestUsecase,
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('s3Client')
    private readonly s3Client: S3Client,
  ) {}

  async execute(id: string, email: string): Promise<string> {
    const request = await this.getPublicationRequestUsecase.execute(id, email);
    assertPending(request);

    const recording = await this.recordingRepository.getRecordingById(
      request.recordingId,
    );
    if (!recording) {
      throw new NotFoundException(
        `Recording not found: ${request.recordingId}`,
      );
    }
    const command = new GetObjectCommand({
      Bucket: process.env.STOCK_MEDIA_BUCKET,
      Key: recording.mediaId,
    });
    return getSignedUrl(this.s3Client, command, {
      expiresIn: PRESIGNED_URL_TTL_SECONDS,
    });
  }
}
