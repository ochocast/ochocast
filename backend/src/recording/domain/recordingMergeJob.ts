/**
 * US-3 — Merge job sent to the merge worker through its own queue, and its
 * result. Kept in sync with ffmpegServer/src/types/job.types.ts.
 */
export interface RecordingMergeJob {
  jobId: string;
  /** The montage recording, created as `processing`. */
  recordingId: string;
  trackId: string;
  /** S3 keys of the source segments, in playback order. */
  sourceKeys: string[];
  /** S3 key where the merged MP4 is written. */
  targetKey: string;
  timestamp: number;
}

export interface RecordingMergeResult {
  jobId: string;
  recordingId: string;
  success: boolean;
  duration: number;
  error?: string;
  /** A failure that a retry cannot fix (unreadable segment, too large...). */
  permanent?: boolean;
  processedAt: number;
}
