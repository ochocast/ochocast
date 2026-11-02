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
  /** Marks the render of `version` failed, if it is still the pending one. */
  markRenderFailed(
    editId: string,
    version: number,
    error: string,
  ): Promise<void>;
}
