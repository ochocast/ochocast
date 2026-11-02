import { PublicationRequestEntity } from 'src/recording/infra/gateways/entities/publication-request.entity';
import {
  PublicationRequestObject,
  PublicationRequestUser,
} from 'src/recording/domain/publicationRequest';
import { UserEntity } from 'src/users/infra/gateways/entities/user.entity';

const toUser = (user?: UserEntity): PublicationRequestUser | undefined =>
  user
    ? { id: user.id, firstName: user.firstName, lastName: user.lastName }
    : undefined;

export function toPublicationRequestObject(
  entity: PublicationRequestEntity,
): PublicationRequestObject {
  return new PublicationRequestObject({
    id: entity.id,
    recordingId: entity.recordingId,
    trackId: entity.trackId,
    requesterId: entity.requesterId,
    targetUserId: entity.targetUserId,
    status: entity.status,
    title: entity.title,
    metadata: entity.metadata,
    refusalReason: entity.refusalReason ?? null,
    videoId: entity.videoId ?? null,
    createdAt: entity.createdAt,
    decidedAt: entity.decidedAt ?? null,
    requester: toUser(entity.requester),
    target: toUser(entity.target),
    trackName: entity.track?.name,
  });
}

export function toPublicationRequestEntity(
  request: PublicationRequestObject,
): PublicationRequestEntity {
  return new PublicationRequestEntity({
    id: request.id,
    recordingId: request.recordingId,
    trackId: request.trackId,
    requesterId: request.requesterId,
    targetUserId: request.targetUserId,
    status: request.status,
    title: request.title,
    metadata: request.metadata,
    refusalReason: request.refusalReason,
    videoId: request.videoId,
    decidedAt: request.decidedAt,
  });
}
