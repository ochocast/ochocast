import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './EventDashboard.module.css';
import MenuTracks from '../Track/MenuTracks/MenuTracks';
import rouageImage from '../../../../assets/rouage.svg';
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

  return (
    <div className={styles.navigation}>
      <h1>{t('dashboard')}</h1>
      <div className={styles.settingsImgButton}>
        <img
          className={styles.imageSettings}
          src={rouageImage}
          alt="iconeSelect"
        />
        <button
          className={styles.buttonSettings}
          type="button"
          onClick={() => navigate(`/events/${props.eventId}/event-settings`)}
        >
          {t('settings')}
        </button>
      </div>
      <div className={styles.settingsImgButton}>
        <img
          className={styles.imageSettings}
          src={rouageImage}
          alt="iconeSelect"
        />
        <button
          className={styles.buttonSettings}
          type="button"
          onClick={() => navigate(`/events/${props.eventId}/event-statistics`)}
        >
          {t('statistics')}
        </button>
      </div>
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
