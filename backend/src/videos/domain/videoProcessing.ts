import type { FinalFailureReason } from 'src/transcoding-jobs/transcoding-outcome';

export type ProcessingState =
  | 'queued'
  | 'processing'
  | 'retrying'
  | 'ready'
  | 'failed';

/** Public body of GET /api/videos/:id/processing. */
export interface VideoProcessingStatus {
  state: ProcessingState;
  /** ISO time the current state started, when known. */
  since: string | null;
  /** Only for a final failure; never the raw worker error. */
  reason: FinalFailureReason | null;
  /** Ready through its source (no HLS renditions). */
  playedFromSource: boolean;
}

/** The video columns the processing state is derived from. */
export interface ProcessingVideo {
  transcoding_status: 'pending' | 'ready' | 'failed';
  transcoding_error: string | null;
  media_id: string;
  createdAt: Date;
}

/** The transcoding job columns the processing state is derived from. */
export interface ProcessingJob {
  status: 'pending' | 'processing' | 'ready' | 'failed';
  attempts: number;
  leaseExpiresAt: Date | null;
  result: { permanent?: boolean; reason?: string; retryable?: boolean } | null;
}
