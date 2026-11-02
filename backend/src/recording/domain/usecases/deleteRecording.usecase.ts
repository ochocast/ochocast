import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { getOrganizedTrack } from '../trackOrganizer';

/**
 * US-3 "Go back" — Delete a merged recording (undo a merge). Only a `merged`
 * recording that is still `unlisted` can be removed; source segments are never
 * touched. Organizer-only.
 */
@Injectable()
export class DeleteRecordingUsecase {
  private readonly logger = new Logger(DeleteRecordingUsecase.name);

  constructor(
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
    @Inject('s3Client')
    private readonly s3Client: S3Client,
  ) {}

  async execute(recordingId: string, email: string): Promise<void> {
    const recording =
      await this.recordingRepository.getRecordingById(recordingId);
    if (!recording) {
      throw new NotFoundException(`Recording not found: ${recordingId}`);
    }

    if (recording.kind !== 'merged') {
      throw new BadRequestException(
        'Only a merged recording can be removed (go back)',
      );
    }
    if (recording.visibility === 'published') {
      throw new BadRequestException('A published recording cannot be removed');
    }

    await getOrganizedTrack(
      {
        trackGateway: this.trackGateway,
        userGateway: this.userGateway,
        eventGateway: this.eventGateway,
      },
      recording.trackId,
      email,
      'Only the organizer can remove this recording',
    );

    // Best-effort removal of the stored file; the DB row is the source of truth.
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: process.env.STOCK_MEDIA_BUCKET,
          Key: recording.mediaId,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Could not delete media for recording ${recordingId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    await this.recordingRepository.deleteRecording(recordingId);
  }
}
