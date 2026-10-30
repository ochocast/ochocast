import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import { IRecordingRepositoryGateway } from '../gateways/recording-repository.gateway';
import { IVideoUploadGateway } from '../gateways/video-upload.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { getCurrentUser } from '../trackOrganizer';
import {
  assertPending,
  assertTarget,
  getSettledRequest,
} from '../publicationRequestAccess';
import { assertPublishable, recordingFilename } from '../recordingPublication';

/**
 * US-6 — The targeted speaker publishes the proposed recording on their own
 * channel: it is copied server side into a new video upload of theirs, which
 * the editor completes before accepting the request.
 */
@Injectable()
export class PreparePublicationRequestUploadUsecase {
  constructor(
    @Inject('PublicationRequestGateway')
    private requestGateway: IPublicationRequestGateway,
    @Inject('RecordingRepositoryGateway')
    private recordingRepository: IRecordingRepositoryGateway,
    @Inject('VideoUploadGateway')
    private videoUploadGateway: IVideoUploadGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(id: string, email: string): Promise<{ id: string }> {
    const request = await getSettledRequest(this.requestGateway, id);
    const user = await getCurrentUser(this.userGateway, email);
    assertTarget(request, user);
    assertPending(request);

    const recording = await this.recordingRepository.getRecordingById(
      request.recordingId,
    );
    if (!recording) {
      throw new NotFoundException(
        `Recording not found: ${request.recordingId}`,
      );
    }
    assertPublishable(recording);

    const upload = await this.videoUploadGateway.createFromStoredMedia(email, {
      key: recording.mediaId,
      filename: recordingFilename(recording),
    });
    return { id: upload.id };
  }
}
