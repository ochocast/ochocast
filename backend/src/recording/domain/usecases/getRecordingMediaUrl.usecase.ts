import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

// Short-lived: this is only used to preview a segment inline.
const PRESIGNED_URL_TTL_SECONDS = 300;

/**
 * Returns a short-lived presigned URL to play/download the raw file of a
 * recording segment. Restricted to the organizer of the segment's track
 * (a track speaker or an editor of the parent event).
 */
@Injectable()
export class GetRecordingMediaUrlUsecase {
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

  async execute(recordingId: string, email: string): Promise<string> {
    const recording =
      await this.recordingRepository.getRecordingById(recordingId);
    if (!recording) {
      throw new NotFoundException(`Recording not found: ${recordingId}`);
    }

    const tracks = await this.trackGateway.getTracks({ id: recording.trackId });
    if (!tracks || tracks.length === 0) {
      throw new NotFoundException(`Track not found: ${recording.trackId}`);
    }

    const currentUser = await this.userGateway.getUserByEmail(email);
    if (!currentUser) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    const track = tracks[0];
    if (!track.canBeEditBy(currentUser)) {
      const event = await this.eventGateway.getEventById(track.eventId);
      if (!event || !event.canBeEditBy(currentUser)) {
        throw new UnauthorizedException(
          'Only the organizer can access this recording',
        );
      }
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
