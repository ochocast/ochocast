import React from 'react';
import styles from './MenuTracks.module.css';
import { Track } from '../../../../../utils/EventsProperties';
import { useTranslation } from 'react-i18next';

import { useNavigate } from 'react-router-dom';
import BrandingImage from '../../../BrandingImage/BrandingImage';

export interface MenuTracksProps {
  tracks: Track[];
  eventId: string;
  imageUrl: string;
  isButtonDisplayed: boolean;
}

const MenuTracks = (props: MenuTracksProps) => {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const TracksIcon = () => (
    <svg
      className={styles.img}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM9 17H7V7H9V17ZM13 17H11V7H13V17ZM17 17H15V7H17V17Z"
        fill="currentColor"
      />
    </svg>
  );

  const addTrackButton = (
    <button
      className={styles.addButton}
      type="button"
      onClick={() => navigate(`/events/${props.eventId}/track-settings`)}
    >
      <BrandingImage imageKey="add" alt="buttonpng" />
    </button>
  );

  const header = (
    <div className={styles.header}>
      <TracksIcon />
      <span className={styles.title}>{t('Tracks')}</span>
      {props.isButtonDisplayed && addTrackButton}
    </div>
  );

  const body = (
    <div className={styles.container}>
      {props.tracks.map((track: Track, index: number) => (
        <button
          className={styles.track}
          key={index}
          onClick={() =>
            navigate(`/events/${props.eventId}/track-settings/${track.id}`)
          }
        >
          {track.name}
        </button>
      ))}
    </div>
  );
  return (
    <div className={styles.menu}>
      {header}
      {body}
    </div>
  );
};

export default MenuTracks;
