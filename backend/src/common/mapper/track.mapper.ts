import { TrackEntity } from '../../tracks/infra/gateways/entities/track.entity';
import { TrackObject } from '../../tracks/domain/track';
import { EventEntity } from 'src/events/infra/gateways/entities/event.entity';
import { toUserEntity, toUserObject } from './user.mapper';

export function toTrackObject(entity: TrackEntity): TrackObject {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    keywords: entity.keywords,
    streamKey: entity.streamKey,
    closed: entity.closed,
    createdAt: entity.createdAt,
    eventId: entity.event?.id ?? entity.eventId,
    speakers: entity.speakers.map((e) => toUserObject(e)),
  };
}

export function toTrackEntity(track: TrackObject): TrackEntity {
  return new TrackEntity({
    ...track,
    event: { id: track.eventId } as EventEntity,
    speakers: track.speakers.map(toUserEntity),
  });
}
