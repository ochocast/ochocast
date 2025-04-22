import { EventEntity } from '../../events/infra/gateways/entities/event.entity';
import { EventObject } from '../../events/domain/event';
import { toTrackEntity } from './track.mapper';

/**
 * Convertit un EventEntity en EventObject
 * @param entity L'entité EventEntity récupérée de la base de données
 * @returns L'objet métier EventObject
 */
export function toEventObject(entity: EventEntity): EventObject {
  return {
    id: entity.id,
    name: entity.name,
    description: entity.description,
    startDate: entity.startDate,
    endDate: entity.endDate,
    imageSlug: entity.imageSlug,
    createdAt: entity.createdAt,
    published: entity.published,
    isPrivate: entity.isPrivate,
    closed: entity.closed,
    tags: entity.tags,
    creatorId: entity.creator?.id ?? entity.creatorId,
    tracks: entity.tracks?.map(toTrackEntity) ?? [],
  };
}

/**
 * Convertit un EventObject en EventEntity
 * @param obj L'objet métier EventObject à persister dans la base
 * @returns L'entité EventEntity pour la persistance
 */
export function toEventEntity(obj: EventObject): EventEntity {
  return new EventEntity({
    ...obj,
  });
}
