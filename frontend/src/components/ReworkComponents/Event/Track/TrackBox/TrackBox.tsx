import React from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './TrackBox.module.css';

import { PublicTrack } from '../../../../../utils/EventsProperties';
import Button, { ButtonType } from '../../../generic/Button/Button';

interface TrackBoxProps {
  key: number;
  track: PublicTrack;
}

const TrackBox = (props: TrackBoxProps) => {
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
      <div className={styles.content}>Orateurs : {speakers.map(e => (e.firstName + " " + e.lastName)).join(', ')}</div>
      <div className={styles.content}>{description}</div>
    </div>
  );
};

export default TrackBox;
