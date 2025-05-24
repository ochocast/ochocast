import React from 'react';
import { useNavigate } from 'react-router-dom';

import { EventStatus } from '../../../../utils/EventStatus';

import styles from './EventBox.module.css';

import Button, { ButtonType } from '../../generic/Button/Button';
import { PublicEvent } from '../../../../utils/EventsProperties';

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
      <Button label="S'inscrire" type={ButtonType.primary} />
      <div className={styles.subscriptionsWrapper}>
        <span className={styles.dot}></span>
        <span className={styles.subscritpions}>{`${
          0 /*event.subscriptions*/
        } inscrits`}</span>
      </div>
    </div>
  );

  const buttonsNotPublished = (
    <div className={styles.centerWrapper}>
      <Button
        label="Publier"
        type={ButtonType.primary}
        onClick={() => props.onPublish && props.onPublish(event.id)}
      />
    </div>
  );

  const buttonsFinished = (
    <div className={styles.centerWrapper}>
      <Button label="Statistiques" type={ButtonType.primary} />
    </div>
  );

  return (
    <div
      className={styles.box}
      onClick={() => navigate(`/events/${event.id}/tracks`)}
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
        {props.event.canBeEditByUser && editButton}
      </div>
      <div className={styles.eventWrapper}>
        <div className={styles.title}>{event.name}</div>
        <div
          className={styles.date}
        >{`Date de début: ${dateDisplay.getDate()}/${
          dateDisplay.getMonth() + 1
        }/${dateDisplay.getFullYear()}`}</div>
      </div>
      <div className={styles.eventWrapper}>
        <div className={styles.info}>{`Créé par : ${
          event.creator
            ? event.creator.firstName + ' ' + event.creator.lastName
            : 'Créateur inconnu'
        }`}</div>
      </div>
      {props.eventStatus === EventStatus.Published && buttonsPublished}
      {props.eventStatus === EventStatus.NotPublished && buttonsNotPublished}
      {props.eventStatus === EventStatus.Finished && buttonsFinished}
    </div>
  );
};

export default EventBox;
