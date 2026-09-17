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
    entity.kind ?? 'segment',
    entity.status ?? 'ready',
    entity.source_segment_ids ?? null,
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
    kind: recording.kind,
    status: recording.status,
    source_segment_ids: recording.sourceSegmentIds,
    createdAt: recording.createdAt,
  });
}
