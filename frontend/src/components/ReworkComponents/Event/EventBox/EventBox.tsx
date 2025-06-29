import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { EventStatus } from '../../../../utils/EventStatus';

import styles from './EventBox.module.css';

import Button, { ButtonType } from '../../generic/Button/Button';
import { PublicEvent } from '../../../../utils/EventsProperties';
import { subscribeEvent } from '../../../../utils/api';
import { t } from 'i18next';

interface EventBoxProps {
  event: PublicEvent;
  imageURL?: string;
  eventStatus: EventStatus;
  onPublish?: (eventId: string) => void;
}

const EventBox = (props: EventBoxProps) => {
  const event = props.event;
  const dateDisplay = new Date(event.startDate);
  const navigate = useNavigate();
  const [nbSubscribe, setNbSubscribe] = useState(event.nbSubscription);

  const editButton = (
    <div className={styles.editButton}>
      <Button
        label="✏️"
        type={ButtonType.primary}
        onClick={() => navigate(`/events/${event.id}/event-settings`)}
      />
    </div>
  );

  const buttonsPublished = (
    <div className={styles.subscribeWrapper}>
      <Button
        label={t('Register')}
        type={ButtonType.primary}
        onClick={async () => {
          if ((await subscribeEvent(event.id)).status == 200)
            setNbSubscribe(nbSubscribe + 1);
        }}
      />
      <div className={styles.subscriptionsWrapper}>
        <span className={styles.dot}></span>
        <span className={styles.subscritpions}>
          {`${nbSubscribe} ` + t('registered')}
        </span>
      </div>
    </div>
  );

  const buttonsNotPublished = (
    <div className={styles.centerWrapper}>
      <Button
        label={t('Publish')}
        type={ButtonType.primary}
        onClick={() => props.onPublish && props.onPublish(event.id)}
      />
    </div>
  );

  const buttonsFinished = (
    <div className={styles.centerWrapper}>
      <Button
        label={t('statistics')}
        type={ButtonType.primary}
        onClick={() => navigate(`/events/${event.id}/event-statistics`)}
      />
    </div>
  );

  const buttonsPreview = (
    <div className={styles.subscribeWrapper}>
      <Button
        label={t('Register')}
        type={ButtonType.primary}
      />
      <div className={styles.subscriptionsWrapper}>
        <span className={styles.dot}></span>
        <span className={styles.subscritpions}>
          {`12 ` + t('registered')}
        </span>
      </div>
    </div>
  );

  return (
    <div
      className={styles.box}
      onClick={() => {if (props.eventStatus !== EventStatus.Preview) {
        navigate(`/events/${event.id}/tracks`);
      }}}
    >
      <div className={styles.imgWrapper}>
        <img
          className={styles.img}
          src={props.imageURL || '../../../../assets/logo_2lignes_crop.png'}
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src = '../../../../assets/logo_2lignes_crop.png';
          }}
          alt="img"
        ></img>
        {props.event.canBeEditByUser && props.eventStatus !== EventStatus.Preview && editButton}
      </div>
      <div className={styles.eventWrapper}>
        <div className={styles.title}>{event.name}</div>
        <div className={styles.date}>
          {t('StartDate') +
            `${dateDisplay.getDate()}/${
              dateDisplay.getMonth() + 1
            }/${dateDisplay.getFullYear()}`}
        </div>
      </div>
      <div className={styles.eventWrapper}>
        <div className={styles.info}>
          {t('CreatedBy') + event.creator
            ? event.creator.firstName + ' ' + event.creator.lastName
            : '' + t('CreatorUnknown')}
        </div>
      </div>
      {props.eventStatus === EventStatus.Published && buttonsPublished}
      {props.eventStatus === EventStatus.NotPublished && buttonsNotPublished}
      {props.eventStatus === EventStatus.Finished && buttonsFinished}
      {props.eventStatus === EventStatus.Preview && buttonsPreview}
    </div>
  );
};

export default EventBox;
