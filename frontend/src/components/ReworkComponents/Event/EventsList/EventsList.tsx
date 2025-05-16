import React, { useCallback, useEffect, useState } from 'react';
import { PublicEvent } from '../../../../utils/EventsProperties';
import { EventStatus } from '../../../../utils/EventStatus';

import leftButton from '../../../../assets/gauche.png';
import rightButton from '../../../../assets/droite.png';

import EventBox from '../EventBox/EventBox';

import styles from './EventsList.module.css';

interface EventsListProps {
  eventStatus: EventStatus;
  title: string;
  events: PublicEvent[];
  onPublish?: (eventId: string) => void;
  viewerID?: string;
}

const EventsList = (props: EventsListProps) => {
  const [index, setIndex] = useState(0);

  const getEventsToShow = useCallback(() => {
    const events = props.events;
    if (events.length <= 3) return events;

    if (index <= events.length - 3) {
      return events.slice(index, index + 3);
    } else {
      return events
        .slice(index, events.length)
        .concat(events.slice(0, 3 - (events.length - index)));
    }
  }, [props.events, index]);

  const eventsShown = getEventsToShow();

  useEffect(() => {
    if (index >= props.events.length) {
      setIndex(0);
    }
  }, [props.events.length, index]);

  const onArrowClick = (arrowDirection: boolean) => {
    let i = index;
    if (arrowDirection) i = i < props.events.length - 1 ? i + 1 : 0;
    else i = i === 0 ? props.events.length - 1 : i - 1;

    setIndex(i);
  };

  const buttonGen = (img: string, onClick: () => void) => (
    <img
      className={styles.arrow}
      src={img}
      alt="Button"
      onClick={onClick}
    ></img>
  );

  return (
    <div className={styles.eventsList}>
      <div className={styles.title}>{props.title}</div>
      <div className={styles.list}>
        {props.events.length > 3 &&
          buttonGen(leftButton, () => onArrowClick(false))}
        <div className={styles.container}>
          {eventsShown.map((event) => (
            <EventBox
              event={event}
              eventStatus={props.eventStatus}
              key={event.id}
              imageURL="logo_2lignes_crop.png"
              onPublish={props.onPublish}
            />
          ))}
        </div>
        {props.events.length > 3 &&
          buttonGen(rightButton, () => onArrowClick(true))}
      </div>
    </div>
  );
};

export default EventsList;
