import React from 'react';
import styles from './MenuTracks.module.css';
import { Track } from '../../../../../utils/EventsProperties';
import addButton from '../../../../../assets/addButton.png';

import { useNavigate } from 'react-router-dom';

export interface MenuTracksProps {
  tracks: Track[];
  eventId: string;
  imageUrl: string;
  isButtonDisplayed: boolean;
}

const MenuTracks = (props: MenuTracksProps) => {
  const navigate = useNavigate();

  const addTrackButton = (
    <button
      className={styles.addButton}
      type="button"
      onClick={() => navigate(`/events/${props.eventId}/track-settings`)}
    >
      <img src={addButton} alt="buttonpng" />
    </button>
  );

  const header = (
    <div className={styles.header}>
      <img className={styles.img} src={props.imageUrl} alt="iconeSelect" />
      <span className={styles.title}>Pistes</span>
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
