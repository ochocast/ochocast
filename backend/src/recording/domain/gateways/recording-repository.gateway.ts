import { RecordingObject, RecordingVisibility } from '../recording';

export interface GetRecordingsFilter {
  visibility?: RecordingVisibility;
}

/**
 * Persistence port for track recording segments.
 * The infra implementation is a TypeORM repository over `recording_entity`.
 */
export interface IRecordingRepositoryGateway {
  createRecording: (recording: RecordingObject) => Promise<RecordingObject>;
  getRecordingsByTrack: (
    trackId: string,
    filter?: GetRecordingsFilter,
  ) => Promise<RecordingObject[]>;
  getRecordingById: (id: string) => Promise<RecordingObject | null>;
  countRecordingsByTrack: (trackId: string) => Promise<number>;
}
