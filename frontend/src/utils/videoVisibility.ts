import { Video } from './VideoProperties';

/** Videos created before transcoding existed have no status: they are ready. */
export const isVideoReady = (video: Pick<Video, 'transcoding_status'>) =>
  !video.transcoding_status || video.transcoding_status === 'ready';

/**
 * Videos shown in lists: processing videos stay visible to everyone (with a
 * badge), final failures only to their creator.
 */
export const filterListedVideos = <T extends Video>(
  videos: T[],
  currentUserId: string | null | undefined,
): T[] =>
  videos.filter(
    (video) =>
      video.transcoding_status !== 'failed' ||
      (!!currentUserId && video.creator?.id === currentUserId),
  );

/** Suggestions and the end-screen next video must be playable right away. */
export const filterReadyVideos = <T extends Video>(videos: T[]): T[] =>
  videos.filter(isVideoReady);

/** Id of the signed-in user, as stored by ProtectedRoutes. */
export const getStoredUserId = (): string | null => {
  try {
    const stored = localStorage.getItem('backendUser');
    const id = stored ? JSON.parse(stored)?.id : null;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
};
