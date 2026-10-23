import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import { PublicationRequestObject } from '../publicationRequest';
import {
  assertPending,
  getCurrentUser,
  getSettledRequest,
  isTrackOrganizer,
} from '../publicationRequestAccess';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';

/** US-6 — The organizer withdraws a request that is still pending. */
@Injectable()
export class CancelPublicationRequestUsecase {
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

  async execute(id: string, email: string): Promise<PublicationRequestObject> {
    const request = await getSettledRequest(this.requestGateway, id);
    const user = await getCurrentUser(this.userGateway, email);

    if (request.requesterId !== user.id) {
      const [track] = await this.trackGateway.getTracks({
        id: request.trackId,
      });
      if (!track)
        throw new NotFoundException(`Track not found: ${request.trackId}`);
      if (!(await isTrackOrganizer(track, user, this.eventGateway))) {
        throw new UnauthorizedException(
          'Only the organizer can cancel this request',
        );
      }
    }
    assertPending(request);

    return this.requestGateway.update(id, {
      status: 'cancelled',
      decidedAt: new Date(),
    });
  }
}
