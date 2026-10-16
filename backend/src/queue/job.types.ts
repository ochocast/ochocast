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
  subtitle_id?: string | null;
  error?: string;
  processedAt: number;
  /** A failure another attempt cannot fix: redeliveries are acknowledged. */
  permanent?: boolean;
  /** Why it is permanent, e.g. duration_exceeded (see SOURCE_PLAYBACK_REASONS). */
  reason?: string;
  /**
   * Set by the backend only, never accepted from a worker: another attempt
   * will run. A failure without it is final (see isFinalFailure).
   */
  retryable?: boolean;
}
