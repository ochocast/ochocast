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
}

/** Where and when a recording was published (US-4 / US-6). */
export interface RecordingPublication {
  publishedAt: Date;
  publishedById: string;
  publishedVideoId: string | null;
}

/**
 * Persistence port for track recordings (segments and merges).
 * The infra implementation is a TypeORM repository over `recording_entity`.
 */
export interface IRecordingRepositoryGateway {
  createRecording: (recording: RecordingObject) => Promise<RecordingObject>;
  /**
   * Stores a raw segment as the last segment of its track: its segmentIndex is
   * assigned here, one after the highest segment index of the track.
   */
  createSegment: (recording: RecordingObject) => Promise<RecordingObject>;
  getRecordingsByTrack: (
    trackId: string,
    filter?: GetRecordingsFilter,
  ) => Promise<RecordingObject[]>;
  getRecordingById: (id: string) => Promise<RecordingObject | null>;
  updateRecording: (
    id: string,
    changes: RecordingUpdate,
  ) => Promise<RecordingObject | null>;
  /**
   * Publishes a recording that is still unlisted and ready, in one statement.
   * False when it no longer is (published meanwhile, deleted...).
   */
  markPublished: (
    id: string,
    publication: RecordingPublication,
  ) => Promise<boolean>;
  deleteRecording: (id: string) => Promise<void>;
}
