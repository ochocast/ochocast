import { RecordingEntity } from '../../recording/infra/gateways/entities/recording.entity';
import { RecordingObject } from '../../recording/domain/recording';

export function toRecordingObject(entity: RecordingEntity): RecordingObject {
  const recording = new RecordingObject(
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
  recording.publishedAt = entity.published_at ?? null;
  recording.publishedVideoId = entity.published_video_id ?? null;
  recording.publishedBy = entity.published_by
    ? {
        id: entity.published_by.id,
        firstName: entity.published_by.firstName,
        lastName: entity.published_by.lastName,
      }
    : null;
  return recording;
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
