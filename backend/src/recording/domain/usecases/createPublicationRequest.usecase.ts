import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import {
  PublicationRequestMetadata,
  PublicationRequestObject,
} from '../publicationRequest';
import {
  assertTrackOrganizer,
  getCurrentUser,
  settleExpiry,
} from '../publicationRequestAccess';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

export interface CreatePublicationRequestInput {
  recordingId: string;
  targetUserId: string;
  title: string;
  metadata: PublicationRequestMetadata;
}

/**
 * US-6 — The organizer asks a track speaker to publish a recording on the
 * speaker's channel. Nothing is published until the speaker accepts.
 */
@Injectable()
export class CreatePublicationRequestUsecase {
  constructor(
    @Inject('PublicationRequestGateway')
    private requestGateway: IPublicationRequestGateway,
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(
    input: CreatePublicationRequestInput,
    email: string,
  ): Promise<PublicationRequestObject> {
    const recording = await this.recordingRepository.getRecordingById(
      input.recordingId,
    );
    if (!recording) {
      throw new NotFoundException(`Recording not found: ${input.recordingId}`);
    }

    const tracks = await this.trackGateway.getTracks({ id: recording.trackId });
    if (!tracks || tracks.length === 0) {
      throw new NotFoundException(`Track not found: ${recording.trackId}`);
    }
    const track = tracks[0];

    const user = await getCurrentUser(this.userGateway, email);
    await assertTrackOrganizer(track, user, this.eventGateway);

    if (recording.visibility !== 'unlisted' || recording.status !== 'ready') {
      throw new BadRequestException('Recording cannot be published');
    }
    if (input.targetUserId === user.id) {
      throw new BadRequestException(
        'Publish on your own channel directly instead',
      );
    }
    if (!track.speakers.some((s) => s.id === input.targetUserId)) {
      throw new BadRequestException(
        'Target user is not a speaker of the track',
      );
    }

    const pending = await this.requestGateway.findPendingByRecording(
      recording.id,
    );
    if (
      pending &&
      (await settleExpiry(this.requestGateway, pending)).status === 'pending'
    ) {
      throw new ConflictException(
        'A publication request is already pending for this recording',
      );
    }

    return this.requestGateway.create(
      new PublicationRequestObject({
        id: uuid(),
        recordingId: recording.id,
        trackId: track.id,
        requesterId: user.id,
        targetUserId: input.targetUserId,
        status: 'pending',
        title: input.title,
        metadata: input.metadata,
        refusalReason: null,
        videoId: null,
        createdAt: new Date(),
        decidedAt: null,
      }),
    );
  }
}
