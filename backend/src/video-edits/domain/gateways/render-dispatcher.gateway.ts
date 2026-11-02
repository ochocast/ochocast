/** Render request of one version of a montage. */
export interface VideoEditRenderJob {
  jobId: string;
  editId: string;
  videoId: string;
  /** The worker renders this version; a newer one supersedes it. */
  version: number;
  timestamp: number;
}

/** Port: hands a render job to the FFmpeg worker (implemented next step). */
export interface IVideoEditRenderDispatcher {
  /** False when rendering is not available on this environment. */
  readonly enabled: boolean;
  dispatch(job: VideoEditRenderJob): Promise<void>;
}
