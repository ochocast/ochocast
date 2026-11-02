/**
 * US-4 / US-6 — Port: opens a video upload whose content is copied server side
 * from a stored recording. The browser then completes it with the video
 * metadata like any upload; its id is the id of the future video.
 */
export interface IVideoUploadGateway {
  createFromStoredMedia: (
    email: string,
    source: { key: string; filename: string },
  ) => Promise<{ id: string }>;
}
