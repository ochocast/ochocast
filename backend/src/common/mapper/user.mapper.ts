import { UserObject } from 'src/users/domain/user';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { toEventEntity, toEventObject } from './event.mapper';

export function toUserObject(entity: UserEntity): UserObject {
  return {
    id: entity.id,
    username: entity.username,
    firstName: entity.firstName,
    lastName: entity.lastName,
    email: entity.email,
    role: entity.role,
    description: entity.description,
    picture_id: entity.picture_id,
    createdAt: entity.createdAt,
    events: entity.events?.map((e) => toEventObject(e)) ?? [],
    comments: [],
    videos: [],
    videosAsSpeaker: [],
  };
}

export function toUserEntity(obj: UserObject): UserEntity {
  return new UserEntity({
    ...obj,
    events: obj.events?.map((e) => toEventEntity(e)) ?? [],
  });
}
