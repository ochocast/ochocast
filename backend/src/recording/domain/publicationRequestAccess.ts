import {
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { TrackObject } from 'src/tracks/domain/track';
import { UserObject } from 'src/users/domain/user';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { IPublicationRequestGateway } from './gateways/publication-request.gateway';
import { PublicationRequestObject } from './publicationRequest';

// Shared checks of the US-6 usecases.

export async function getCurrentUser(
  userGateway: IUserGateway,
  email: string,
): Promise<UserObject> {
  const user = await userGateway.getUserByEmail(email);
  if (!user) throw new NotFoundException(`User with email ${email} not found`);
  return user;
}

/** Organizer = a track speaker or an editor of the parent event. */
export async function isTrackOrganizer(
  track: TrackObject,
  user: UserObject,
  eventGateway: IEventGateway,
): Promise<boolean> {
  if (track.canBeEditBy(user)) return true;
  const event = await eventGateway.getEventById(track.eventId);
  return !!event && event.canBeEditBy(user);
}

export async function assertTrackOrganizer(
  track: TrackObject,
  user: UserObject,
  eventGateway: IEventGateway,
): Promise<void> {
  if (!(await isTrackOrganizer(track, user, eventGateway))) {
    throw new UnauthorizedException(
      'Only the organizer can manage the publications of this track',
    );
  }
}

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
