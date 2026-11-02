import { useCallback, useEffect, useState } from 'react';
import { getTrackRecordingStatus } from '../utils/api';

export type RecordingState =
  | 'disabled'
  | 'armed_waiting'
  | 'recording'
  | 'error';

export type RecordingErrorKind =
  | 'start_failed'
  | 'stop_failed'
  | 'recorder_unreachable';

export interface RecordingStatus {
  state: RecordingState;
  error: { kind: RecordingErrorKind; occurredAt: string | null } | null;
}

const POLL_INTERVAL_MS = 5000;

/**
 * US-5c — Polls the recording status of a track while `enabled` (organizer
 * only: the endpoint refuses anyone else). Skips polls while the tab is hidden.
 */
export const useRecordingStatus = (
  trackId: string | undefined,
  enabled: boolean,
) => {
  const [status, setStatus] = useState<RecordingStatus | null>(null);

  const refresh = useCallback(async () => {
    if (!trackId || !enabled) return;
    const response = await getTrackRecordingStatus(trackId);
    if (response.ok) setStatus(response.data as RecordingStatus);
  }, [trackId, enabled]);

  useEffect(() => {
    if (!trackId || !enabled) {
      setStatus(null);
      return;
    }
    refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [trackId, enabled, refresh]);

  return { status, refresh };
};
