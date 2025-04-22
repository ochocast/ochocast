import { UserObject } from 'src/users/domain/user';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';
import { toEventObject } from './event.mapper';

export function toUserObject(entity: UserEntity): UserObject {
  return {
    id: entity.id,
    firstName: entity.firstName,
    lastName: entity.lastName,
    email: entity.email,
    role: entity.role,
    description: entity.description,
    picture_id: entity.picture_id,
    createdAt: entity.createdAt,
    events: entity.events?.map(toEventObject) ?? [],
    comments: [],
    videos: [],
    videosAsSpeaker: [],
  };
}
