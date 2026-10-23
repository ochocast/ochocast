import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { IPublicationRequestGateway } from '../gateways/publication-request.gateway';
import { PublicationRequestObject } from '../publicationRequest';
import { getCurrentUser, getSettledRequest } from '../publicationRequestAccess';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

/**
 * US-6 — A publication request, for its targeted speaker (review page) or its
 * requester.
 */
@Injectable()
export class GetPublicationRequestUsecase {
  constructor(
    @Inject('PublicationRequestGateway')
    private requestGateway: IPublicationRequestGateway,
    @Inject('UserGateway')
    private userGateway: IUserGateway,
  ) {}

  async execute(id: string, email: string): Promise<PublicationRequestObject> {
    const request = await getSettledRequest(this.requestGateway, id);
    const user = await getCurrentUser(this.userGateway, email);
    if (request.targetUserId !== user.id && request.requesterId !== user.id) {
      throw new UnauthorizedException('Not allowed to see this request');
    }
    return request;
  }
}
