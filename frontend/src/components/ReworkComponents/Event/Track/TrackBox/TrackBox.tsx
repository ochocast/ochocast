import React from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './TrackBox.module.css';

import { Track } from '../../../../../utils/EventsProperties';
import Button, { ButtonType } from '../../../generic/Button/Button';
import { useTranslation } from 'react-i18next';

interface TrackBoxProps {
  key: number;
  track: Track;
}

const TrackBox = (props: TrackBoxProps) => {
  const { name, closed, id, speakers, description } = props.track;
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <div className={styles.box}>
      <div className={styles.wrapper}>
        <span className={styles.title}>{name}</span>
        <Button
          label={closed ? t('ClosedTrack') : t('WatchTheTrack')}
          type={closed ? ButtonType.disabled : ButtonType.secondary}
          onClick={() => navigate(`/tracks/${id}`)}
        />
      </div>
      <div className={styles.line} />
      <div className={styles.content}>
        {t('Speakers') + ' : '}
        {speakers &&
          speakers.length > 0 &&
          speakers.map((e) => e.firstName + ' ' + e.lastName).join(', ')}
      </div>
      <div className={styles.content}>{description}</div>
    </div>
  );
};

export default TrackBox;
