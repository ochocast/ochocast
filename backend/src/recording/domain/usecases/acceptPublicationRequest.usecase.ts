import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { PublicationRequestObject } from '../publicationRequest';
import {
  assertPending,
  assertTarget,
  getCurrentUser,
  getSettledRequest,
} from '../publicationRequestAccess';
import { IVideoGateway } from 'src/videos/domain/gateways/videos.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

/**
 * US-6 — The targeted speaker accepted: they published `videoId` on their own
 * channel from the request. The recording leaves the unlisted working set.
 */
@Injectable()
export class AcceptPublicationRequestUsecase {
  constructor(
    @Inject('PublicationRequestGateway')
    private requestGateway: IPublicationRequestGateway,
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('VideoGateway')
    private videoGateway: IVideoGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(
    id: string,
    videoId: string,
    email: string,
  ): Promise<PublicationRequestObject> {
    const request = await getSettledRequest(this.requestGateway, id);
    const user = await getCurrentUser(this.userGateway, email);
    assertTarget(request, user);
    assertPending(request);

    const [video] = await this.videoGateway.getVideos({ id: videoId });
    if (!video || video.creator?.id !== user.id) {
      throw new BadRequestException('Video not found on your channel');
    }

    await this.recordingRepository.updateRecording(request.recordingId, {
      visibility: 'published',
      publishedAt: new Date(),
      publishedById: user.id,
      publishedVideoId: videoId,
    });
    return this.requestGateway.update(id, {
      status: 'accepted',
      videoId,
      decidedAt: new Date(),
    });
  }
}
