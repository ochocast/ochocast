import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TFunction } from 'i18next';
import { VideoProcessing } from '../../../../utils/VideoProperties';
import { processingFailureCopy } from '../../../../utils/videoProcessing';
import styles from './VideoProcessingStatus.module.css';

export interface VideoProcessingStatusProps {
  /** Latest answer of GET /videos/:id/processing, null until it arrives. */
  status: VideoProcessing | null;
  /** The video is already known to have failed for good. */
  failed?: boolean;
  /** The viewer created the video: explain why it failed and what to do. */
  isCreator?: boolean;
}

const MINUTE_MS = 60000;

/** What a screen reader announces: changes with the state, never the minutes. */
const stateLabel = (status: VideoProcessing | null, t: TFunction): string => {
  switch (status?.state) {
    case 'queued':
      return t('videoProcessingStageQueued');
    case 'retrying':
      return t('videoProcessingStageRetrying');
    case 'processing':
      return t('videoProcessingStageProcessing');
    default:
      return t('videoProcessingTitle');
  }
};

const stageLabel = (
  status: VideoProcessing | null,
  now: number,
  t: TFunction,
): string | null => {
  switch (status?.state) {
    case 'queued':
    case 'retrying':
      return stateLabel(status, t);
    case 'processing': {
      const startedAt = status.since ? Date.parse(status.since) : NaN;
      if (Number.isNaN(startedAt)) return t('videoProcessingStageProcessing');
      const minutes = Math.floor((now - startedAt) / MINUTE_MS);
      return minutes < 1
        ? t('videoProcessingStageProcessingJustStarted')
        : t('videoProcessingStageProcessingSince', { minutes });
    }
    default:
      return null;
  }
};

const ErrorIcon = () => (
  <svg
    className={styles.failedIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="7" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

/** Compact panel shown inside the player box until the video can be played. */
const VideoProcessingStatus = ({
  status,
  failed = false,
  isCreator = false,
}: VideoProcessingStatusProps) => {
  const { t } = useTranslation();
  const [, setTick] = useState(0);
  const counting = status?.state === 'processing' && !!status.since;

  // Re-render so "depuis X min" keeps up while nothing else changes.
  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => setTick((n) => n + 1), MINUTE_MS / 2);
    return () => window.clearInterval(id);
  }, [counting]);

  const failedForGood = failed || status?.state === 'failed';
  // Only a reason code reaches the page: never a raw technical error.
  const copy =
    status?.state === 'failed' ? processingFailureCopy(status.reason) : null;
  const stage = failedForGood ? null : stageLabel(status, Date.now(), t);

  return (
    <div className={styles.panel}>
      {/* The only live region, kept mounted across states so each change is
          announced; the minute counter below stays out of it. */}
      <p className={styles.visuallyHidden} role="status" aria-live="polite">
        {failedForGood
          ? t('videoProcessingFailedTitle')
          : stateLabel(status, t)}
      </p>
      {failedForGood ? (
        <>
          <ErrorIcon />
          <h2 className={styles.title}>{t('videoProcessingFailedTitle')}</h2>
          {isCreator && copy && (
            <div className={styles.details}>
              <p className={styles.reason}>{t(copy.reason)}</p>
              <p className={styles.advice}>{t(copy.advice)}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <span className={styles.spinner} aria-hidden="true" />
          <h2 className={styles.title}>{t('videoProcessingTitle')}</h2>
          <p className={styles.description}>
            {t('videoProcessingDescription')}
          </p>
          {stage && (
            <p className={styles.stage}>
              <span className={styles.stageDot} aria-hidden="true" />
              {stage}
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default VideoProcessingStatus;
