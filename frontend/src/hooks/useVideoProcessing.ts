import { useEffect, useRef, useState } from 'react';
import { VideoProcessing } from '../utils/VideoProperties';
import {
  fetchVideoProcessing,
  isFinalProcessingState,
  nextPollDelay,
} from '../utils/videoProcessing';

interface UseVideoProcessingOptions {
  /** Poll only while the video is not ready yet. */
  enabled: boolean;
  /** Called once, when the video becomes ready or fails for good. */
  onFinal?: (status: VideoProcessing, videoId: string) => void;
}

/**
 * Follows a video's processing: checks right away, then backs off from 5 s to
 * 30 s, pauses while the tab is hidden and stops on ready or failed.
 */
export function useVideoProcessing(
  videoId: string | undefined,
  { enabled, onFinal }: UseVideoProcessingOptions,
): { status: VideoProcessing | null } {
  const [entry, setEntry] = useState<{
    videoId: string;
    status: VideoProcessing;
  } | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    if (!enabled || !videoId) return;

    let cancelled = false;
    let stopped = false;
    let inFlight = false;
    let timer: number | undefined;
    let attempt = 0;

    const schedule = () => {
      if (cancelled || stopped || document.hidden) return;
      timer = window.setTimeout(poll, nextPollDelay(attempt++));
    };

    const poll = async () => {
      timer = undefined;
      if (inFlight) return;
      inFlight = true;
      const result = await fetchVideoProcessing(videoId);
      inFlight = false;
      if (cancelled) return;

      if (result.kind === 'not_found') {
        stopped = true;
        return;
      }
      if (result.kind === 'status') {
        setEntry({ videoId, status: result.status });
        if (isFinalProcessingState(result.status.state)) {
          stopped = true;
          onFinalRef.current?.(result.status, videoId);
          return;
        }
      }
      schedule();
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        timer = undefined;
      } else if (!stopped && timer === undefined && !inFlight) {
        void poll();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    if (!document.hidden) void poll();

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [videoId, enabled]);

  return { status: entry && entry.videoId === videoId ? entry.status : null };
}
