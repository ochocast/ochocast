import { isUUID } from 'class-validator';
import { ITrackGateway } from '../../tracks/domain/gateways/tracks.gateway';
import { IEventGateway } from '../../events/domain/gateways/events.gateway';
import { UserObject } from '../../users/domain/user';

// Who may see and moderate a track's chat. Same rules as the events REST API: a
// published event's chat is public; an unpublished one is visible to its creator and
// its speakers only. Moderation (deleting others' messages, clearing, polls) belongs to
// the track's speakers and the event's creator.
export class ChatAccess {
  constructor(
    private readonly trackGateway: ITrackGateway,
    private readonly eventGateway: IEventGateway,
  ) {}

  async canRead(trackId: string, user: UserObject | null): Promise<boolean> {
    const found = await this.trackAndEvent(trackId);
    if (!found) return false;
    if (found.event.published) return true;
    // canBeReadBy needs the creator and the speakers: refuse when they are not loaded.
    try {
      return !!user && found.event.canBeReadBy(user);
    } catch {
      return false;
    }
  }

  async canModerate(
    trackId: string,
    user: UserObject | null,
  ): Promise<boolean> {
    if (!user) return false;
    const found = await this.trackAndEvent(trackId);
    if (!found) return false;
    try {
      return found.track.canBeEditBy(user) || found.event.canBeEditBy(user);
    } catch {
      return false;
    }
  }

  private async trackAndEvent(trackId: string) {
    if (typeof trackId !== 'string' || !isUUID(trackId)) return null;
    const tracks = await this.trackGateway.getTracks({ id: trackId });
    if (tracks.length === 0) return null;
    const event = await this.eventGateway.getEventById(tracks[0].eventId);
    if (!event) return null;
    return { track: tracks[0], event };
  }
}
