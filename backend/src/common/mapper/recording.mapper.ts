import { RecordingEntity } from '../../recording/infra/gateways/entities/recording.entity';
import { RecordingObject } from '../../recording/domain/recording';

export function toRecordingObject(entity: RecordingEntity): RecordingObject {
  return new RecordingObject(
    entity.id,
    entity.trackId,
    entity.media_id,
    entity.visibility,
    entity.problematic,
    entity.segment_index,
    entity.duration ?? null,
    entity.createdAt,
  );
}

export function toRecordingEntity(recording: RecordingObject): RecordingEntity {
  return new RecordingEntity({
    id: recording.id,
    trackId: recording.trackId,
    media_id: recording.mediaId,
    visibility: recording.visibility,
    problematic: recording.problematic,
    segment_index: recording.segmentIndex,
    duration: recording.duration,
    createdAt: recording.createdAt,
  });
}
