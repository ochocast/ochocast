import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useUploadContext,
  UploadItem,
  UploadStatus,
} from '../../../context/UploadContext';
import { useTranslation } from 'react-i18next';
import styles from './UploadPanel.module.css';

const UploadIcon = () => (
  <svg
    className={styles.uploadIcon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const getStatusText = (
  status: UploadStatus,
  t: (key: string) => string,
): string => {
  switch (status) {
    case 'pending':
      return t('uploadStatusPending') || 'En attente...';
    case 'uploading':
      return t('uploadStatusUploading') || 'Téléversement...';
    case 'processing':
      return t('uploadStatusProcessing') || 'Traitement en cours...';
    case 'completed':
      return t('uploadStatusCompleted') || 'Terminé !';
    case 'error':
      return t('uploadStatusError') || 'Erreur';
    default:
      return '';
  }
};

interface UploadItemCardProps {
  item: UploadItem;
  onRemove: (id: string) => void;
  onView: (videoId: string) => void;
  onRetry: (id: string) => void;
  onGoToUploadPage: () => void;
}

const UploadItemCard: React.FC<UploadItemCardProps> = ({
  item,
  onRemove,
  onView,
  onRetry,
  onGoToUploadPage,
}) => {
  const { t } = useTranslation();

  const getProgressFillClass = () => {
    switch (item.status) {
      case 'processing':
        return `${styles.progressFill} ${styles.progressFillProcessing}`;
      case 'completed':
        return `${styles.progressFill} ${styles.progressFillCompleted}`;
      case 'error':
        return `${styles.progressFill} ${styles.progressFillError}`;
      default:
        return styles.progressFill;
    }
  };

  const getStatusTextClass = () => {
    switch (item.status) {
      case 'completed':
        return `${styles.statusText} ${styles.statusTextCompleted}`;
      case 'error':
        return `${styles.statusText} ${styles.statusTextError}`;
      default:
        return styles.statusText;
    }
  };

  return (
    <div className={styles.uploadItem}>
      <div className={styles.uploadItemHeader}>
        <div className={styles.uploadInfo}>
          <p className={styles.uploadTitle}>{item.title}</p>
          <p className={styles.uploadFileName}>{item.fileName}</p>
        </div>
        {(item.status === 'completed' || item.status === 'error') && (
          <button
            className={styles.removeButton}
            onClick={() => onRemove(item.id)}
            title={t('remove')}
          >
            ✕
          </button>
        )}
      </div>

      <div className={styles.progressContainer}>
        <div className={styles.progressBar}>
          <div
            className={getProgressFillClass()}
            style={{
              width: `${item.status === 'error' ? 100 : item.progress}%`,
            }}
          />
        </div>
      </div>

      <div className={styles.statusRow}>
        <span className={getStatusTextClass()}>
          {item.status === 'error' && item.errorMessage
            ? item.errorMessage
            : getStatusText(item.status, t)}
        </span>
        {item.status === 'uploading' && (
          <span className={styles.progressPercent}>{item.progress}%</span>
        )}
        {item.status === 'processing' && (
          <span className={styles.progressPercent}>
            {item.progress > 0 ? `${item.progress}%` : ''}
          </span>
        )}
        {item.status === 'completed' && item.videoId && (
          <button
            className={styles.viewButton}
            onClick={() => onView(item.videoId!)}
          >
            {t('viewVideo')}
          </button>
        )}
        {item.status === 'error' && (
          <div className={styles.errorActions}>
            <button
              className={styles.retryButton}
              onClick={() => onGoToUploadPage()}
              title={t('goToUploadPage')}
            >
              {t('goToUploadPage')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const UploadPanel: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    uploads,
    isPanelOpen,
    removeUpload,
    clearCompleted,
    togglePanel,
    closePanel,
    retryUpload,
  } = useUploadContext();

  const activeUploads = uploads.filter(
    (u) =>
      u.status === 'uploading' ||
      u.status === 'processing' ||
      u.status === 'pending',
  );
  const hasActiveUploads = activeUploads.length > 0;
  const hasCompletedUploads = uploads.some((u) => u.status === 'completed');
  const hasErrorUploads = uploads.some((u) => u.status === 'error');

  const handleViewVideo = (videoId: string) => {
    navigate(`/video/${videoId}`);
    closePanel();
  };

  const handleGoToUploadPage = () => {
    navigate('/video/video-settings');
    closePanel();
  };

  const handleRetry = (id: string) => {
    retryUpload(id);
  };

  // Ne pas afficher si aucun upload
  if (uploads.length === 0 && !isPanelOpen) {
    return null;
  }

  return (
    <div className={styles.panelContainer}>
      <button
        className={`${styles.toggleButton} ${hasActiveUploads ? styles.toggleButtonWithUploads : ''} ${hasErrorUploads ? styles.toggleButtonWithErrors : ''}`}
        onClick={togglePanel}
        title={t('uploadPanel')}
      >
        <UploadIcon />
        {uploads.length > 0 && (
          <span
            className={`${styles.badge} ${hasErrorUploads ? styles.badgeError : ''}`}
          >
            {uploads.length}
          </span>
        )}
      </button>

      <div
        className={`${styles.panel} ${!isPanelOpen ? styles.panelHidden : ''}`}
      >
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>
            {t('uploads')} ({uploads.length})
          </h3>
          <div className={styles.headerActions}>
            {hasCompletedUploads && (
              <button className={styles.headerButton} onClick={clearCompleted}>
                {t('clearCompleted')}
              </button>
            )}
            <button className={styles.closeButton} onClick={closePanel}>
              ✕
            </button>
          </div>
        </div>

        <div className={styles.uploadList}>
          {uploads.length === 0 ? (
            <div className={styles.emptyState}>
              <UploadIcon />
              <p className={styles.emptyText}>{t('noUploads')}</p>
            </div>
          ) : (
            uploads.map((item) => (
              <UploadItemCard
                key={item.id}
                item={item}
                onRemove={removeUpload}
                onView={handleViewVideo}
                onRetry={handleRetry}
                onGoToUploadPage={handleGoToUploadPage}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadPanel;
