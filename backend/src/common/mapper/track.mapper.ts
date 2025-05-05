import { TrackEntity } from '../../tracks/infra/gateways/entities/track.entity';
import { TrackObject } from '../../tracks/domain/track';
import { EventEntity } from 'src/events/infra/gateways/entities/event.entity';
import { toUserEntity, toUserObject } from './user.mapper';

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
    entity.speakers ? entity.speakers.map(toUserObject) : [],
  );
}

export function toTrackEntity(track: TrackObject): TrackEntity {
  return new TrackEntity({
    ...track,
    event: { id: track.eventId } as EventEntity,
    speakers: track.speakers?.map(toUserEntity) ?? [],
  });
}
