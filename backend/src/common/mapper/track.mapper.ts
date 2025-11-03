import { TrackEntity } from '../../tracks/infra/gateways/entities/track.entity';
import { TrackObject } from '../../tracks/domain/track';
import { EventEntity } from 'src/events/infra/gateways/entities/event.entity';
import { toUserObject } from './user.mapper';
import { toEventObject } from './event.mapper';
import { PublicUserObject } from '../../users/domain/publicUser';

export function toTrackObject(entity: TrackEntity): TrackObject {
  return new TrackObject(
    entity.id,
    entity.name,
    entity.description,
    entity.keywords,
    entity.streamKey,
    entity.closed,
    entity.eventId,
    entity.createdAt,
    entity.startDate,
    entity.endDate,
    entity.speakers
      ? entity.speakers.map((e) => new PublicUserObject(toUserObject(e)))
      : [],
    null,
  );
}

export function toTrackEntity(track: TrackObject): TrackEntity {
  return new TrackEntity({
    ...track,
    event: { id: track.eventId } as EventEntity,
    speakers: [], // <!> must be completed after
  });
}
