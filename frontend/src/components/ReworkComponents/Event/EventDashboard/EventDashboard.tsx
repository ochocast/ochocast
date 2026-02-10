import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './EventDashboard.module.css';
import MenuTracks from '../Track/MenuTracks/MenuTracks';
import trackSelectImage from '../../../../assets/tracksIconeSelect.png';
import { Track } from '../../../../utils/EventsProperties';

export interface EventDashboardProps {
  eventId?: string;
  tracks: Track[];
  eventClosed: boolean;
}

const EventDashboard = (props: EventDashboardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const SettingsIcon = () => (
    <svg
      className={styles.imageSettings}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 15.5C10.067 15.5 8.5 13.933 8.5 12C8.5 10.067 10.067 8.5 12 8.5C13.933 8.5 15.5 10.067 15.5 12C15.5 13.933 13.933 15.5 12 15.5ZM19.43 12.98C19.47 12.66 19.5 12.34 19.5 12C19.5 11.66 19.47 11.34 19.43 11.02L21.54 9.37C21.73 9.22 21.78 8.95 21.66 8.73L19.66 5.27C19.54 5.05 19.27 4.97 19.05 5.05L16.56 6.05C16.04 5.65 15.48 5.32 14.87 5.07L14.49 2.42C14.46 2.18 14.25 2 14 2H10C9.75 2 9.54 2.18 9.51 2.42L9.13 5.07C8.52 5.32 7.96 5.66 7.44 6.05L4.95 5.05C4.73 4.96 4.46 5.05 4.34 5.27L2.34 8.73C2.21 8.95 2.27 9.22 2.46 9.37L4.57 11.02C4.53 11.34 4.5 11.67 4.5 12C4.5 12.33 4.53 12.66 4.57 12.98L2.46 14.63C2.27 14.78 2.21 15.05 2.34 15.27L4.34 18.73C4.46 18.95 4.73 19.03 4.95 18.95L7.44 17.95C7.96 18.35 8.52 18.68 9.13 18.93L9.51 21.58C9.54 21.82 9.75 22 10 22H14C14.25 22 14.46 21.82 14.49 21.58L14.87 18.93C15.48 18.68 16.04 18.34 16.56 17.95L19.05 18.95C19.27 19.04 19.54 18.95 19.66 18.73L21.66 15.27C21.78 15.05 21.73 14.78 21.54 14.63L19.43 12.98Z"
        fill="currentColor"
      />
    </svg>
  );

  const StatisticsIcon = () => (
    <svg
      className={styles.imageSettings}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M5 9.2H9V19H5V9.2ZM15.8 5H19.8V19H15.8V5ZM10.9 13.5H14.9V19H10.9V13.5Z"
        fill="currentColor"
      />
    </svg>
  );

  return (
    <div className={styles.navigation}>
      <h1>{t('dashboard')}</h1>
      <button
        className={styles.settingsImgButton}
        type="button"
        onClick={() => navigate(`/events/${props.eventId}/event-settings`)}
      >
        <SettingsIcon />
        <span className={styles.buttonSettings}>{t('settings')}</span>
      </button>
      <button
        className={styles.settingsImgButton}
        type="button"
        onClick={() => navigate(`/events/${props.eventId}/event-statistics`)}
      >
        <StatisticsIcon />
        <span className={styles.buttonSettings}>{t('statistics')}</span>
      </button>
      <MenuTracks
        tracks={props.tracks}
        eventId={props.eventId ?? ''}
        isButtonDisplayed={props.eventClosed}
        imageUrl={trackSelectImage}
      />
    </div>
  );
};
export default EventDashboard;
