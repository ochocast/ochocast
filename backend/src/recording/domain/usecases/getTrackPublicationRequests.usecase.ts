import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import { PublicationRequestObject } from '../publicationRequest';
import {
  assertTrackOrganizer,
  getCurrentUser,
  settleExpiry,
} from '../publicationRequestAccess';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

/**
 * US-6 — Publication requests of a track (newest first), so the organizer
 * sees which recordings wait for a speaker, were refused or expired.
 */
@Injectable()
export class GetTrackPublicationRequestsUsecase {
  constructor(
    @Inject('PublicationRequestGateway')
    private requestGateway: IPublicationRequestGateway,
    @Inject('TrackGateway')
    private trackGateway: ITrackGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
    @Inject('EventGateway')
    private eventGateway: IEventGateway,
  ) {}

  async execute(
    trackId: string,
    email: string,
  ): Promise<PublicationRequestObject[]> {
    const tracks = await this.trackGateway.getTracks({ id: trackId });
    if (!tracks || tracks.length === 0) {
      throw new NotFoundException(`Track not found: ${trackId}`);
    }
    const user = await getCurrentUser(this.userGateway, email);
    await assertTrackOrganizer(tracks[0], user, this.eventGateway);

    const requests = await this.requestGateway.findByTrack(trackId);
    return Promise.all(
      requests.map((r) => settleExpiry(this.requestGateway, r)),
    );
  }
}
