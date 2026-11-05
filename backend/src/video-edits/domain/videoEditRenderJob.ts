import { SegmentInput } from './videoEdit';

/**
 * Render of one version of a montage by the FFmpeg worker (mode `render`).
 * Kept in sync with ffmpegServer/src/types/job.types.ts.
 */

/** Signed queue message: small, the full job comes with the claim. */
export interface VideoEditRenderMessage {
  jobId: string;
  editId: string;
  videoId: string;
  /** Montage version rendered; a newer one supersedes the job. */
  version: number;
  timestamp: number;
}

/** Returned by the claim: everything the worker needs. */
export interface VideoEditRenderJob extends VideoEditRenderMessage {
  /** Original file in the media bucket, read only. */
  sourceKey: string;
  /** Unique folder of this render: `${videoId}/edits/${jobId}`. */
  outputPrefix: string;
  segments: SegmentInput[];
}

export type RenderFailureReason =
  | 'invalid_source'
  | 'source_too_large'
  | 'deadline_exceeded';

export interface VideoEditRenderResult {
  jobId: string;
  editId: string;
  success: boolean;
  /** Seconds of the edited video. */
  duration: number;
  /** `${outputPrefix}/master.m3u8`, checked by the backend. */
  mediaId?: string;
  error?: string;
  /** Another attempt would fail the same way: no retry. */
  permanent?: boolean;
  reason?: RenderFailureReason;
  processedAt: number;
}

export const renditionPrefix = (videoId: string, jobId: string) =>
  `${videoId}/edits/${jobId}`;

export const renditionMaster = (videoId: string, jobId: string) =>
  `${renditionPrefix(videoId, jobId)}/master.m3u8`;

/** Job id of a rendered media id, or null if it is not a rendition. */
export function renditionJobId(
  videoId: string,
  mediaId: string | null | undefined,
): string | null {
  const match = /^([^/]+)\/edits\/([0-9a-f-]{36})\/master\.m3u8$/i.exec(
    mediaId ?? '',
  );
  return match && match[1] === videoId ? match[2] : null;
}
