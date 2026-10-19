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
}
