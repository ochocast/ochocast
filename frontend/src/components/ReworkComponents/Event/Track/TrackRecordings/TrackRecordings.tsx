import React, { FC, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getTrackRecordings,
  getRecordingMediaUrl,
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
}

interface TrackRecordingsProps {
  trackId: string;
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
  return d.toLocaleString();
};

/**
 * US-2 — Lists the unlisted recording segments of a track in the track
 * settings. A segment flagged `problematic` (truncated / unreadable) shows a
 * red "!" warning icon; it is never hidden, the organizer decides what to do.
 * Each segment can be previewed inline via a short-lived presigned URL.
 */
const TrackRecordings: FC<TrackRecordingsProps> = ({ trackId }) => {
  const { t } = useTranslation();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await getTrackRecordings(trackId);
      if (res.ok && Array.isArray(res.data)) {
        setRecordings(res.data as Recording[]);
      } else {
        setError(true);
      }
    } catch (err) {
      logger.error({ err, trackId }, 'Failed to fetch track recordings');
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [trackId]);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  const togglePreview = useCallback(
    async (recordingId: string) => {
      // Clicking the open preview closes it.
      if (previewId === recordingId) {
        setPreviewId(null);
        setPreviewUrl(null);
        return;
      }
      setPreviewError(false);
      setPreviewLoadingId(recordingId);
      try {
        const res = await getRecordingMediaUrl(recordingId);
        if (res.ok && res.data && (res.data as { url?: string }).url) {
          setPreviewUrl((res.data as { url: string }).url);
          setPreviewId(recordingId);
        } else {
          setPreviewError(true);
          setPreviewId(recordingId);
          setPreviewUrl(null);
        }
      } catch (err) {
        logger.error({ err, recordingId }, 'Failed to load recording media');
        setPreviewError(true);
        setPreviewId(recordingId);
        setPreviewUrl(null);
      } finally {
        setPreviewLoadingId(null);
      }
    },
    [previewId],
  );

  return (
    <div className={styles.trackDateSpeakerWrapper}>
      <div className={styles.header}>
        <h3>{t('Recordings') || 'Recordings'}</h3>
        <button
          type="button"
          className={styles.refreshButton}
          onClick={fetchRecordings}
          disabled={loading}
        >
          {t('Refresh') || 'Refresh'}
        </button>
      </div>

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
        <ul className={styles.list}>
          {recordings.map((rec) => {
            const isOpen = previewId === rec.id;
            const isPreviewLoading = previewLoadingId === rec.id;
            return (
              <li key={rec.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <span className={styles.index}>#{rec.segmentIndex + 1}</span>

                  <div className={styles.meta}>
                    <span className={styles.duration}>
                      {formatDuration(rec.duration)}
                    </span>
                    <span className={styles.date}>
                      {formatDate(rec.createdAt)}
                    </span>
                  </div>

                  <div className={styles.badges}>
                    {rec.problematic && (
                      <span
                        className={styles.warning}
                        title={
                          t('RecordingProblematic') ||
                          'This segment may be truncated or unreadable.'
                        }
                        aria-label={
                          t('RecordingProblematic') ||
                          'This segment may be truncated or unreadable.'
                        }
                      >
                        !
                      </span>
                    )}
                    <span className={styles.badgeUnlisted}>
                      {t('Unlisted') || 'Unlisted'}
                    </span>
                    <button
                      type="button"
                      className={styles.previewButton}
                      onClick={() => togglePreview(rec.id)}
                      disabled={isPreviewLoading}
                    >
                      {isPreviewLoading
                        ? t('Loading') || 'Loading...'
                        : isOpen
                          ? t('Close') || 'Close'
                          : t('Preview') || 'Preview'}
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className={styles.previewArea}>
                    {previewError ? (
                      <p className={styles.error}>
                        {t('PreviewUnavailable') ||
                          'Preview is not available for this segment.'}
                      </p>
                    ) : (
                      previewUrl && (
                        <video
                          className={styles.video}
                          src={previewUrl}
                          controls
                          preload="metadata"
                        />
                      )
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default TrackRecordings;
