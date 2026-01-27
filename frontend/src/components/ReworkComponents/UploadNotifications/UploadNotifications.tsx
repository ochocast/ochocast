import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useUploadContext,
  UploadNotification,
} from '../../../context/UploadContext';
import { useTranslation } from 'react-i18next';
import styles from './UploadNotifications.module.css';

const CheckIcon = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ErrorIcon = () => (
  <svg
    className={styles.icon}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

interface NotificationCardProps {
  notification: UploadNotification;
  onDismiss: (id: string) => void;
  onView: (videoId: string) => void;
  onGoToUploadPage: () => void;
}

const NotificationCard: React.FC<NotificationCardProps> = ({
  notification,
  onDismiss,
  onView,
  onGoToUploadPage,
}) => {
  const { t } = useTranslation();

  // Auto-dismiss after 8 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      onDismiss(notification.id);
    }, 8000);
    return () => clearTimeout(timer);
  }, [notification.id, onDismiss]);

  return (
    <div className={styles.notification}>
      <div
        className={`${styles.iconContainer} ${
          notification.type === 'success'
            ? styles.iconSuccess
            : styles.iconError
        }`}
      >
        {notification.type === 'success' ? <CheckIcon /> : <ErrorIcon />}
      </div>

      <div className={styles.content}>
        <p className={styles.title}>{notification.title}</p>
        <p className={styles.message}>{notification.message}</p>
        <div className={styles.actions}>
          {notification.type === 'success' && notification.videoId && (
            <button
              className={styles.viewButton}
              onClick={() => onView(notification.videoId!)}
            >
              {t('viewVideo')}
            </button>
          )}
          {notification.type === 'error' && (
            <button
              className={styles.viewButton}
              onClick={() => {
                onGoToUploadPage();
                onDismiss(notification.id);
              }}
            >
              {t('goToUploadPage')}
            </button>
          )}
          <button
            className={styles.dismissButton}
            onClick={() => onDismiss(notification.id)}
          >
            {t('dismiss')}
          </button>
        </div>
      </div>

      <button
        className={styles.closeButton}
        onClick={() => onDismiss(notification.id)}
      >
        ✕
      </button>
    </div>
  );
};

const UploadNotifications: React.FC = () => {
  const navigate = useNavigate();
  const { notifications, dismissNotification } = useUploadContext();

  const handleView = (videoId: string) => {
    navigate(`/video/${videoId}`);
    // Dismiss all notifications when navigating
    notifications.forEach((n) => dismissNotification(n.id));
  };

  const handleGoToUploadPage = () => {
    navigate('/video/video-settings');
  };

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className={styles.notificationContainer}>
      {notifications.map((notification) => (
        <NotificationCard
          key={notification.id}
          notification={notification}
          onDismiss={dismissNotification}
          onView={handleView}
          onGoToUploadPage={handleGoToUploadPage}
        />
      ))}
    </div>
  );
};

export default UploadNotifications;
