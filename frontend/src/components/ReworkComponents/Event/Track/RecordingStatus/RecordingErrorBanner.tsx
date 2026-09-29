import React, { FC } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RecordingStatus } from '../../../../../hooks/useRecordingStatus';
import { useRecordingErrorMessage } from './RecordingStatus';
import styles from './RecordingErrorBanner.module.css';

interface RecordingErrorBannerProps {
  status: RecordingStatus | null;
  settingsPath: string;
}

/**
 * US-5c — Recording failure banner on the live page. The caller renders it
 * for the organizer only (the status endpoint is organizer-only anyway).
 */
const RecordingErrorBanner: FC<RecordingErrorBannerProps> = ({
  status,
  settingsPath,
}) => {
  const { t } = useTranslation();
  const errorMessage = useRecordingErrorMessage();
  if (status?.state !== 'error') return null;

  return (
    <div className={styles.banner} role="alert">
      <strong>{t('RecordingErrorBannerTitle')}</strong>
      <span>{errorMessage(status.error)}</span>
      <Link to={settingsPath} className={styles.link}>
        {t('OpenTrackSettings')}
      </Link>
    </div>
  );
};

export default RecordingErrorBanner;
