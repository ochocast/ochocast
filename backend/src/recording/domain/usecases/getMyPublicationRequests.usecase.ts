import { Inject, Injectable } from '@nestjs/common';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import { PublicationRequestObject } from '../publicationRequest';
import { getCurrentUser, settleExpiry } from '../publicationRequestAccess';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

/** US-6 — Pending publication requests addressed to the current user. */
@Injectable()
export class GetMyPublicationRequestsUsecase {
  constructor(
    @Inject('PublicationRequestGateway')
    private requestGateway: IPublicationRequestGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(email: string): Promise<PublicationRequestObject[]> {
    const user = await getCurrentUser(this.userGateway, email);
    const requests = await this.requestGateway.findByTarget(user.id, 'pending');
    const settled = await Promise.all(
      requests.map((r) => settleExpiry(this.requestGateway, r)),
    );
    return settled.filter((r) => r.status === 'pending');
  }
}
