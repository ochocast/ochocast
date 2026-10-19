import { useCallback, useEffect, useRef, useState } from 'react';
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

/**
 * Loads the signed media URL of a video that just became ready: tries right
 * away, then after 2 s, 5 s and 10 s on network or server errors. `load`
 * resolves null once every try failed (`unavailable` is then set) or when its
 * tries were dropped: by a new load, another video or the page unmounting.
 */
export function useMediaUrlRetry(videoId: string | undefined): {
  unavailable: boolean;
  load: (videoId: string) => Promise<string | null>;
  /** Like load, unless a load already ran for this video: resolves null. */
  loadOnce: (videoId: string) => Promise<string | null>;
} {
  const [unavailableFor, setUnavailableFor] = useState<string | null>(null);
  const cancelRef = useRef<() => void>(() => undefined);
  const loadedRef = useRef(new Set<string>());
  const cancel = useCallback(() => cancelRef.current(), []);

  useEffect(() => cancel, [videoId, cancel]);

  const load = useCallback(
    async (id: string) => {
      loadedRef.current.add(id);
      cancel();
      let cancelled = false;
      let timer: number | undefined;
      let wake: () => void = () => undefined;
      cancelRef.current = () => {
        cancelled = true;
        window.clearTimeout(timer);
        wake();
      };
      // Resolved early by cancelRef so a dropped load returns at once.
      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          wake = resolve;
          timer = window.setTimeout(resolve, ms);
        });
      setUnavailableFor(null);

      for (let attempt = 0; ; attempt++) {
        const url = await fetchMediaUrl(id);
        if (cancelled) return null;
        if (url) return url;
        if (attempt >= MEDIA_RETRY_DELAYS_MS.length) {
          setUnavailableFor(id);
          return null;
        }
        await wait(MEDIA_RETRY_DELAYS_MS[attempt]);
        if (cancelled) return null;
      }
    },
    [cancel],
  );

  const loadOnce = useCallback(
    async (id: string) => (loadedRef.current.has(id) ? null : load(id)),
    [load],
  );

  return {
    unavailable: !!videoId && unavailableFor === videoId,
    load,
    loadOnce,
  };
}
