import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { TrackObject } from 'src/tracks/domain/track';
import { UserObject } from 'src/users/domain/user';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';

// Shared access checks of the recording and publication usecases.

export async function getTrack(
  trackGateway: ITrackGateway,
  trackId: string,
): Promise<TrackObject> {
  const tracks = await trackGateway.getTracks({ id: trackId });
  if (!tracks || tracks.length === 0) {
    throw new NotFoundException(`Track not found: ${trackId}`);
  }
  return tracks[0];
}

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
  message = 'Only the organizer can manage the recordings of this track',
): Promise<void> {
  if (!(await isTrackOrganizer(track, user, eventGateway))) {
    throw new UnauthorizedException(message);
  }
}

/** Loads the track and the current user, and checks they organize it. */
export async function getOrganizedTrack(
  gateways: {
    trackGateway: ITrackGateway;
    userGateway: IUserGateway;
    eventGateway: IEventGateway;
  },
  trackId: string,
  email: string,
  message?: string,
): Promise<{ track: TrackObject; user: UserObject }> {
  const track = await getTrack(gateways.trackGateway, trackId);
  const user = await getCurrentUser(gateways.userGateway, email);
  await assertTrackOrganizer(track, user, gateways.eventGateway, message);
  return { track, user };
}
