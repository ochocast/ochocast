import { EventEntity } from '../../events/infra/gateways/entities/event.entity';
import { EventObject } from '../../events/domain/event';
import { toTrackEntity, toTrackObject } from './track.mapper';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { toUserObject } from './user.mapper';
import { PublicUserObject } from 'src/users/domain/publicUser';

/**
 * Convertit un EventEntity en EventObject
 * @param entity L'entité EventEntity récupérée de la base de données
 * @returns L'objet métier EventObject
 */
export function toEventObject(entity: EventEntity): EventObject {
  return new EventObject(
    entity.id,
    entity.name,
    entity.description,
    entity.tags,
    entity.startDate,
    entity.endDate,
    entity.published,
    entity.isPrivate,
    entity.closed,
    entity.imageSlug,
    entity.tracks?.map((e) => toTrackObject(e)) ?? [],
    entity.creator?.id ?? entity.creatorId,
    entity.createdAt,
    entity.creator ? toUserObject(entity.creator) : undefined,
    entity.usersSubscribe?.map((e) => new PublicUserObject(toUserObject(e))),
  );
}
/**
 * Convertit un EventObject en EventEntity
 * @param obj L'objet métier EventObject à persister dans la base
 * @returns L'entité EventEntity pour la persistance
 */
export function toEventEntity(obj: EventObject): EventEntity {
  return new EventEntity({
    ...obj,
    tracks: obj.tracks?.map((e) => toTrackEntity(e)),
    creator: { id: obj.creatorId } as UserEntity,
    usersSubscribe: [], // <!> must be completed after
  });
}
