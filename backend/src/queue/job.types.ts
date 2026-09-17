export interface VideoTranscodingJob {
  jobId: string;
  videoId: string;
  originalFileName: string;
  originalKey: string;
  miniatureSourceKey?: string;
  subtitleSourceKey?: string;
  media_id: string;
  miniature_id: string;
  subtitle_id?: string;
  title: string;
  timestamp: number;
}

export interface VideoTranscodingResult {
  jobId: string;
  videoId: string;
  success: boolean;
  duration: number;
  error?: string;
  processedAt: number;
}

/**
 * US-3 — Job asking the ffmpeg worker to concatenate several recording
 * segments into a single merged file.
 */
export interface MergeRecordingJob {
  jobId: string;
  recordingId: string;
  trackId: string;
  /** Ordered S3 keys of the source segments (chronological). */
  sourceKeys: string[];
  /** S3 key where the merged file must be written. */
  targetKey: string;
  timestamp: number;
}

export interface MergeRecordingResult {
  jobId: string;
  recordingId: string;
  success: boolean;
  duration?: number;
  error?: string;
  processedAt: number;
}
