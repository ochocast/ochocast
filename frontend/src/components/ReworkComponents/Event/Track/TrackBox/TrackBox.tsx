import React from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './TrackBox.module.css';

import { Track } from '../../../../../utils/EventsProperties';
import Button, { ButtonType } from '../../../generic/Button/Button';

interface TrackBoxProps {
  key: number;
  track: Track;
}

const TrackBox = (props: TrackBoxProps) => {
  props.track.speakers = ['Speaker 1', 'Speaker 2']; // FIXME : delete when speakers will be implemented in back
  const { name, closed, id, speakers, description } = props.track;
  const navigate = useNavigate();

  return (
    <div className={styles.box}>
      <div className={styles.wrapper}>
        <span className={styles.title}>{name}</span>
        <Button
          label={closed ? 'Piste fermée' : 'Regarder la piste'}
          type={closed ? ButtonType.disabled : ButtonType.secondary}
          onClick={() => navigate(`/tracks/${id}`)}
        />
      </div>
      <div className={styles.line} />
      <div className={styles.content}>Orateurs : {speakers.join(', ')}</div>
      <div className={styles.content}>{description}</div>
    </div>
  );
};

export default TrackBox;
