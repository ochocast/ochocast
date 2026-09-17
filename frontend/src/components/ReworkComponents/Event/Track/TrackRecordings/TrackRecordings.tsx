import React, { FC, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  getTrackRecordings,
  getRecordingMediaUrl,
  mergeRecordings,
  deleteRecording,
} from '../../../../../utils/api';
import logger from '../../../../../utils/logger';
import styles from './TrackRecordings.module.css';

export interface Recording {
  id: string;
  trackId: string;
  mediaId: string;
  visibility: 'unlisted' | 'published';
  problematic: boolean;
  segmentIndex: number;
  duration: number | null;
  createdAt: string;
  kind: 'segment' | 'merged';
  status: 'ready' | 'processing' | 'failed';
  sourceSegmentIds: string[] | null;
}

interface TrackRecordingsProps {
  trackId: string;
  trackName?: string;
}

const formatDuration = (seconds: number | null): string => {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * US-2 / US-3 / US-3.5 — Card grid of the unlisted recordings of a track.
 * Raw segments can be selected (checkbox on the card) and merged; the merged
 * result appears as a card with its processing status and a "Go back" action.
 * Ready recordings show their first frame as a thumbnail and play inline.
 */
const TrackRecordings: FC<TrackRecordingsProps> = ({ trackId, trackName }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const [merging, setMerging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  // Track which ids we've already requested a URL for, to avoid refetching.
  const requestedUrls = useRef<Set<string>>(new Set());

  const loadThumbnails = useCallback((recs: Recording[]) => {
    recs
      .filter((r) => r.status === 'ready' && !requestedUrls.current.has(r.id))
      .forEach(async (r) => {
        requestedUrls.current.add(r.id);
        try {
          const res = await getRecordingMediaUrl(r.id);
          const url = res.ok && (res.data as { url?: string })?.url;
          if (url) setMediaUrls((prev) => ({ ...prev, [r.id]: url }));
        } catch (err) {
          logger.error({ err, id: r.id }, 'Failed to load recording media');
        }
      });
  }, []);

  const fetchRecordings = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(false);
      try {
        const res = await getTrackRecordings(trackId);
        if (res.ok && Array.isArray(res.data)) {
          const recs = res.data as Recording[];
          setRecordings(recs);
          loadThumbnails(recs);
        } else if (!silent) {
          setError(true);
        }
      } catch (err) {
        logger.error({ err, trackId }, 'Failed to fetch track recordings');
        if (!silent) setError(true);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [trackId, loadThumbnails],
  );

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  // Auto-refresh (silently) while a merge is still processing.
  useEffect(() => {
    const hasProcessing = recordings.some((r) => r.status === 'processing');
    if (!hasProcessing) return;
    const interval = setInterval(() => {
      void fetchRecordings(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [recordings, fetchRecordings]);

  const manualRefresh = () => {
    requestedUrls.current = new Set();
    setMediaUrls({});
    void fetchRecordings();
  };

  const toggleSelect = (id: string) => {
    setActionError(null);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const confirmMerge = async () => {
    if (selected.length < 2) return;
    setMerging(true);
    setActionError(null);
    try {
      const res = await mergeRecordings(trackId, selected);
      if (res.ok) {
        setSelected([]);
        await fetchRecordings();
      } else {
        setActionError(t('MergeError') || 'Merge failed.');
      }
    } catch (err) {
      logger.error({ err, trackId }, 'Failed to merge recordings');
      setActionError(t('MergeError') || 'Merge failed.');
    } finally {
      setMerging(false);
    }
  };

  const goToPublish = (rec: Recording) => {
    const base = (trackName ?? '').trim();
    const suffix =
      rec.kind === 'merged'
        ? t('MergeTitleSuffix') || 'Merge'
        : t('RecordingTitleSuffix') || 'Recording';
    const title = base ? `${base} — ${suffix}` : suffix;
    navigate('/video/video-settings', {
      state: { recordingId: rec.id, title },
    });
  };

  const goBack = async (id: string) => {
    setDeletingId(id);
    setActionError(null);
    try {
      const res = await deleteRecording(id);
      if (res.ok) {
        await fetchRecordings();
      } else {
        setActionError(t('DeleteError') || 'Could not remove the recording.');
      }
    } catch (err) {
      logger.error({ err, id }, 'Failed to delete recording');
      setActionError(t('DeleteError') || 'Could not remove the recording.');
    } finally {
      setDeletingId(null);
    }
  };

  const renderCard = (rec: Recording, variant: 'strip' | 'full') => {
    const isMerged = rec.kind === 'merged';
    const isReady = rec.status === 'ready';
    const isSelected = selected.includes(rec.id);
    const url = mediaUrls[rec.id];
    const variantClass =
      variant === 'full' ? styles.cardFull : styles.cardStrip;

    return (
      <div
        key={rec.id}
        className={`${styles.card} ${variantClass} ${
          isSelected ? styles.cardSelected : ''
        }`}
      >
        <div className={styles.thumb}>
          {isReady && url ? (
            <video
              className={styles.thumbVideo}
              src={url}
              controls
              preload="metadata"
            />
          ) : (
            <div className={styles.thumbPlaceholder}>
              {rec.status === 'processing'
                ? t('StatusProcessing') || 'Processing…'
                : rec.status === 'failed'
                  ? t('StatusFailed') || 'Failed'
                  : '…'}
            </div>
          )}

          {!isMerged && (
            <label className={styles.checkboxOverlay}>
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(rec.id)}
                aria-label={t('Select') || 'Select'}
              />
            </label>
          )}

          {rec.problematic && (
            <span
              className={styles.warnOverlay}
              title={
                t('RecordingProblematic') ||
                'This segment may be truncated or unreadable.'
              }
            >
              !
            </span>
          )}

          {isMerged && (
            <span className={styles.mergedTag}>{t('Merged') || 'Merged'}</span>
          )}

          {rec.duration != null && (
            <span className={styles.durationOverlay}>
              {formatDuration(rec.duration)}
            </span>
          )}
        </div>

        <div className={styles.cardBody}>
          <div className={styles.cardInfo}>
            <span className={styles.cardTitle}>
              {isMerged ? t('Merged') || 'Merged' : `#${rec.segmentIndex + 1}`}
            </span>
            <span className={styles.cardDate}>{formatDate(rec.createdAt)}</span>
          </div>

          <div className={styles.cardActions}>
            {isReady && (
              <button
                type="button"
                className={styles.publishButton}
                onClick={() => goToPublish(rec)}
              >
                {t('Publish') || 'Publish'}
              </button>
            )}
            {isMerged && (
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => goBack(rec.id)}
                disabled={deletingId === rec.id}
              >
                {deletingId === rec.id
                  ? t('Loading') || 'Loading...'
                  : t('GoBack') || 'Go back'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.trackDateSpeakerWrapper}>
      <div className={styles.header}>
        <h3>{t('Recordings') || 'Recordings'}</h3>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.mergeButton}
            onClick={confirmMerge}
            disabled={merging || selected.length < 2}
            title={
              selected.length < 2
                ? t('SelectAtLeastTwo') || 'Select at least two segments'
                : ''
            }
          >
            {merging
              ? t('Loading') || 'Loading...'
              : `${t('ConfirmMerge') || 'Confirm merge'}${
                  selected.length > 0 ? ` (${selected.length})` : ''
                }`}
          </button>
          <button
            type="button"
            className={styles.refreshButton}
            onClick={manualRefresh}
            disabled={loading}
          >
            {t('Refresh') || 'Refresh'}
          </button>
        </div>
      </div>

      {actionError && <p className={styles.error}>{actionError}</p>}

      {loading && (
        <p className={styles.muted}>{t('Loading') || 'Loading...'}</p>
      )}

      {!loading && error && (
        <p className={styles.error}>
          {t('RecordingsLoadError') || 'Could not load recordings.'}
        </p>
      )}

      {!loading && !error && recordings.length === 0 && (
        <p className={styles.muted}>
          {t('NoRecordingsYet') ||
            'No recording yet. Segments appear here once the live is recorded.'}
        </p>
      )}

      {!loading && !error && recordings.length > 0 && (
        <>
          {recordings.some((r) => r.kind === 'segment') && (
            <div className={styles.strip}>
              {recordings
                .filter((r) => r.kind === 'segment')
                .map((r) => renderCard(r, 'strip'))}
            </div>
          )}

          {recordings.some((r) => r.kind === 'merged') && (
            <>
              <div className={styles.sectionLabel}>
                {t('Merges') || 'Merges'}
              </div>
              <div className={styles.mergedList}>
                {recordings
                  .filter((r) => r.kind === 'merged')
                  .map((r) => renderCard(r, 'full'))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default TrackRecordings;
