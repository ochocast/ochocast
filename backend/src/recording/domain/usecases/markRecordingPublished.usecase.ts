import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { getOrganizedTrack } from '../trackOrganizer';
import {
  assertNoPendingRequest,
  assertPublishable,
} from '../recordingPublication';

/**
 * US-4 — Mark a recording as `published` once the organizer has created a video
 * from it through the regular video editor. Does not create a video itself;
 * it flips the recording out of the unlisted working set so it can't be
 * published twice, and records when / on whose channel / as which video.
 * Organizer-only, and refused while a speaker is asked to publish it (US-6).
 */
@Injectable()
export class MarkRecordingPublishedUsecase {
  constructor(
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('PublicationRequestGateway')
    private requestGateway: IPublicationRequestGateway,
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(
    recordingId: string,
    email: string,
    videoId?: string,
  ): Promise<void> {
    const recording =
      await this.recordingRepository.getRecordingById(recordingId);
    if (!recording) {
      throw new NotFoundException(`Recording not found: ${recordingId}`);
    }

    const { user } = await getOrganizedTrack(
      {
        trackGateway: this.trackGateway,
        userGateway: this.userGateway,
        eventGateway: this.eventGateway,
      },
      recording.trackId,
      email,
      'Only the organizer can publish this recording',
    );
    assertPublishable(recording);
    await assertNoPendingRequest(this.requestGateway, recording.id);

    if (videoId) {
      const [video] = await this.videoGateway.getVideos({ id: videoId });
      if (!video || video.creator?.id !== user.id) {
        throw new BadRequestException('Video not found on your channel');
      }
    }

    // Conditional: a concurrent publication of the same recording loses here.
    const published = await this.recordingRepository.markPublished(
      recordingId,
      {
        publishedAt: new Date(),
        publishedById: user.id,
        publishedVideoId: videoId ?? null,
      },
    );
    if (!published) {
      throw new ConflictException('Recording is already published');
    }
  }
}
