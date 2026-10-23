import { Inject, Injectable } from '@nestjs/common';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import { PublicationRequestObject } from '../publicationRequest';
import {
  assertPending,
  assertTarget,
  getCurrentUser,
  getSettledRequest,
} from '../publicationRequestAccess';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

/**
 * US-6 — The targeted speaker refuses, with an optional reason shown to the
 * organizer. Nothing is published; the recording stays unlisted.
 */
@Injectable()
export class RefusePublicationRequestUsecase {
  constructor(
    @Inject('PublicationRequestGateway')
    private requestGateway: IPublicationRequestGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(
    id: string,
    reason: string | undefined,
    email: string,
  ): Promise<PublicationRequestObject> {
    const request = await getSettledRequest(this.requestGateway, id);
    const user = await getCurrentUser(this.userGateway, email);
    assertTarget(request, user);
    assertPending(request);

    return this.requestGateway.update(id, {
      status: 'refused',
      refusalReason: reason?.trim() || null,
      decidedAt: new Date(),
    });
  }
}
