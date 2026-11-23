import { isUUID } from 'class-validator';
import { ITrackGateway } from '../../tracks/domain/gateways/tracks.gateway';
import { IEventGateway } from '../../events/domain/gateways/events.gateway';
import { UserObject } from '../../users/domain/user';

// Who may see and moderate a track's chat. A live is open to anyone who has its link,
// published event or not (an unpublished event is unlisted, not private), and so is
// its chat: anyone reads it, signed-in users post in it. Only an existing track has a
// chat. Moderation (deleting others' messages, clearing, polls) belongs to the track's
// speakers and the event's creator.
export class ChatAccess {
  constructor(
    private readonly trackGateway: ITrackGateway,
    private readonly eventGateway: IEventGateway,
  ) {}

  async canRead(trackId: string): Promise<boolean> {
    return (await this.trackAndEvent(trackId)) !== null;
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
