import { useCallback, useEffect, useState } from 'react';
import { getMedia } from '../utils/api';

/** Waits before each new try once the first one failed. */
export const MEDIA_RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

/** Error responses (e.g. 404 while processing) carry an object, not a URL. */
export const urlFrom = (response?: {
  ok: boolean;
  data?: unknown;
}): string | null =>
  response?.ok && typeof response.data === 'string' && response.data
    ? response.data
    : null;

const fetchMediaUrl = async (videoId: string): Promise<string | null> => {
  try {
    return urlFrom(await getMedia(videoId));
  } catch {
    return null;
  }
};

interface MediaUrlState {
  videoId: string | undefined;
  url: string | null;
  unavailable: boolean;
}

/**
 * The one owner of the media URL of the video a page shows. Once the video is
 * ready it loads the URL once (right away, then 2 s, 5 s and 10 s after a
 * network or server error, then `unavailable`). It never asks again for the
 * same video: a new URL makes the player reload from the start, and none is
 * needed (the HLS playlist goes through a stable API route, and a source is
 * signed for twice its duration plus an hour). Everything is tied to
 * `videoId`: on another video it starts over, and a request made for the
 * previous one never reaches the next.
 */
export function useVideoMediaUrl(
  videoId: string | undefined,
  ready: boolean,
): { url: string | null; unavailable: boolean; retry: () => void } {
  const [state, setState] = useState<MediaUrlState>({
    videoId: undefined,
    url: null,
    unavailable: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!videoId || !ready) return;
    let cancelled = false;
    let timer: number | undefined;
    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        timer = window.setTimeout(resolve, ms);
      });
    const show = (url: string | null, unavailable: boolean) => {
      if (!cancelled) setState({ videoId, url, unavailable });
    };

    const run = async () => {
      show(null, false);
      for (let tryIndex = 0; ; tryIndex++) {
        const url = await fetchMediaUrl(videoId);
        if (cancelled) return;
        if (url) {
          show(url, false);
          return;
        }
        if (tryIndex >= MEDIA_RETRY_DELAYS_MS.length) {
          show(null, true);
          return;
        }
        await wait(MEDIA_RETRY_DELAYS_MS[tryIndex]);
        if (cancelled) return;
      }
    };
    void run();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [videoId, ready, attempt]);

  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const current = state.videoId === videoId;
  return {
    url: current ? state.url : null,
    unavailable: current && state.unavailable,
    retry,
  };
}
