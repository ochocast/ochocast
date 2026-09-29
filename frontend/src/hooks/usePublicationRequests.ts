import { useCallback, useEffect, useState } from 'react';
import { getMyPublicationRequests } from '../utils/api';
import {
  PUBLICATION_REQUESTS_CHANGED,
  PublicationRequest,
} from '../utils/PublicationRequest';

const POLL_INTERVAL_MS = 60_000;

/**
 * US-6 — Pending publication requests addressed to the logged-in user,
 * refreshed periodically, when the tab regains focus and right after one is
 * answered.
 */
export const usePublicationRequests = (enabled: boolean) => {
  const [requests, setRequests] = useState<PublicationRequest[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const response = await getMyPublicationRequests();
    if (response.ok && Array.isArray(response.data)) {
      setRequests(response.data as PublicationRequest[]);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setRequests([]);
      return;
    }
    refresh();
    const interval = window.setInterval(() => {
      if (!document.hidden) refresh();
    }, POLL_INTERVAL_MS);
    window.addEventListener(PUBLICATION_REQUESTS_CHANGED, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(PUBLICATION_REQUESTS_CHANGED, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, refresh]);

  return requests;
};
