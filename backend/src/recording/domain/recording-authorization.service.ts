import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ITrackGateway } from 'src/tracks/domain/gateways/tracks.gateway';
import { IEventGateway } from 'src/events/domain/gateways/events.gateway';
import { IUserGateway } from 'src/users/domain/gateways/users.gateway';

// Claims attached to request.user by the global Keycloak AuthGuard, never body
// fields or an unverified JWT. The recorder's role only permits publication.
export interface RecordingPrincipal {
  sub?: string;
  email?: string;
  realm_access?: { roles?: string[] };
}

@Injectable()
export class RecordingAuthorizationService {
  constructor(
    @Inject('TrackGateway') private readonly tracks: ITrackGateway,
    @Inject('EventGateway') private readonly events: IEventGateway,
    @Inject('UserGateway') private readonly users: IUserGateway,
  ) {}

  async authorize(
    trackId: string,
    principal: RecordingPrincipal,
    allowRecorder = false,
  ) {
    if (!principal?.sub) throw new UnauthorizedException('Sign in to record');
    const recorder =
      allowRecorder &&
      principal.realm_access?.roles?.includes('service-recorder');
    const user = principal.email
      ? await this.users.getUserByEmail(principal.email)
      : null;
    if (!recorder && !user)
      throw new UnauthorizedException('Sign in to record');

    const [track] = await this.tracks.getTracks({ id: trackId });
    if (!track) throw new NotFoundException(`Track ${trackId} not found`);
    const event = await this.events.getEventById(track.eventId);
    if (!event) throw new NotFoundException(`Event ${track.eventId} not found`);

    // Same domain rule as live rooms: a track speaker or its event's creator.
    if (!recorder && !track.canBeEditBy(user) && !event.canBeEditBy(user))
      throw new ForbiddenException('You cannot record this track');
    return { track, event };
  }
}
