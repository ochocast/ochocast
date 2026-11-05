import { RenderStatus, SegmentInput, VideoEditObject } from '../videoEdit';

export type ReplaceContentResult =
  | { status: 'ok'; edit: VideoEditObject }
  | { status: 'not_found' }
  | { status: 'render_in_progress'; renderStatus: RenderStatus }
  | { status: 'version_conflict'; currentVersion: number };

export interface ReplaceContentOptions {
  /** Refuses the write when the stored version differs. Omit to skip. */
  expectedVersion?: number;
  /** Status the montage gets with its new content. */
  renderStatus: RenderStatus;
  /** Drops the rendered version: viewers get the original back. */
  clearRenderedMedia?: boolean;
  /** Registers the render job of the new version in the same transaction. */
  renderJob?: { jobId: string; sourceKey: string };
}

export interface IVideoEditGateway {
  findByVideoId(videoId: string): Promise<VideoEditObject | null>;
  /** Null when the video already has a montage. */
  create(
    videoId: string,
    segments: SegmentInput[],
  ): Promise<VideoEditObject | null>;
  /**
   * Replaces every segment and text layer in one transaction, under a row
   * lock, and bumps the version. Refused while a render is in progress.
   */
  replaceContent(
    videoId: string,
    segments: SegmentInput[],
    options: ReplaceContentOptions,
  ): Promise<ReplaceContentResult>;
  /**
   * The job could not be published: deletes it and fails the render of
   * `version`, if that is still the pending one.
   */
  abortRender(
    jobId: string,
    editId: string,
    version: number,
    error: string,
  ): Promise<void>;
  /**
   * The original file to render from, never modified: the upload kept by
   * transcoding, else a video played from its source. Null when only the
   * HLS output is left.
   */
  findSourceKey(videoId: string, mediaId: string): Promise<string | null>;
}
