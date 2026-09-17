import {
  RecordingObject,
  RecordingStatus,
  RecordingVisibility,
} from '../recording';

export interface GetRecordingsFilter {
  visibility?: RecordingVisibility;
}

export interface RecordingUpdate {
  status?: RecordingStatus;
  mediaId?: string;
  duration?: number | null;
  visibility?: RecordingVisibility;
}

/**
 * Persistence port for track recordings (segments and merges).
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
  updateRecording: (
    id: string,
    changes: RecordingUpdate,
  ) => Promise<RecordingObject | null>;
  deleteRecording: (id: string) => Promise<void>;
}
