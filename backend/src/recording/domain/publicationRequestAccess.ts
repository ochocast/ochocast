import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { UserObject } from 'src/users/domain/user';
import { IPublicationRequestGateway } from './gateways/publication-request.gateway';
import { PublicationRequestObject } from './publicationRequest';

// Shared checks of the US-6 usecases (organizer checks: trackOrganizer.ts).

/** Loads a request, turning an unanswered stale one into `expired`. */
export async function getSettledRequest(
  gateway: IPublicationRequestGateway,
  id: string,
): Promise<PublicationRequestObject> {
  const request = await gateway.getById(id);
  if (!request)
    throw new NotFoundException(`Publication request ${id} not found`);
  return settleExpiry(gateway, request);
}

export async function settleExpiry(
  gateway: IPublicationRequestGateway,
  request: PublicationRequestObject,
): Promise<PublicationRequestObject> {
  if (!request.isStale()) return request;
  return gateway.update(request.id, {
    status: 'expired',
    decidedAt: new Date(),
  });
}

export function assertTarget(
  request: PublicationRequestObject,
  user: UserObject,
): void {
  if (request.targetUserId !== user.id) {
    throw new UnauthorizedException(
      'Only the speaker targeted by this request can answer it',
    );
  }
}

export function assertPending(request: PublicationRequestObject): void {
  if (request.status !== 'pending') {
    throw new ForbiddenException(
      `Publication request is ${request.status}, not pending`,
    );
  }
}
