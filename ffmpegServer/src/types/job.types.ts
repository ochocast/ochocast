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

/**
 * Failures that another attempt cannot fix. For a video too long to transcode
 * (duration_exceeded, deadline_exceeded) the backend plays the source instead:
 * both are only reported once the final miniature and subtitle are written.
 * A deadline before encoding started (a stalled S3 read) stays retryable.
 */
export type PermanentFailureReason =
  | 'source_too_large'
  | 'invalid_source'
  | 'duration_exceeded'
  | 'deadline_exceeded';

export class PermanentJobError extends Error {
  constructor(
    public readonly reason: PermanentFailureReason,
    message: string,
  ) {
    super(message);
  }
}

export interface VideoTranscodingResult {
  jobId: string;
  videoId: string;
  success: boolean;
  duration: number;
  subtitle_id?: string | null;
  error?: string;
  processedAt: number;
  /** Stored, then acknowledged: the trigger does not retry this failure. */
  permanent?: boolean;
  reason?: PermanentFailureReason;
  /**
   * Set on a failure once the source was probed: whether browsers decode its
   * codecs as is. The source fallback requires it.
   */
  sourceCodecsPlayable?: boolean;
}

export interface HLSVariant {
  resolution: string;
  scale: string;
  bitrate: string;
  name: string;
}

export const HLS_VARIANTS: HLSVariant[] = [
  { resolution: '640x360', scale: '640:360', bitrate: '800k', name: '360p' },
  { resolution: '854x480', scale: '854:480', bitrate: '1400k', name: '480p' },
  { resolution: '1280x720', scale: '1280:720', bitrate: '2800k', name: '720p' },
];

/** US-3 — Merge several recording segments into one montage (merge worker). */
export interface RecordingMergeJob {
  jobId: string;
  /** The montage recording created as `processing` by the backend. */
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
  processedAt: number;
  /**
   * Stored, then acknowledged: the montage fails for good. Sent only for a
   * PermanentJobError (segments over the size budget, unreadable segment).
   */
  permanent?: boolean;
}
