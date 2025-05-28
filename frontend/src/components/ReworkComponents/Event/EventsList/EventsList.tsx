import React, { useCallback, useEffect, useState } from 'react';
import { PublicEvent } from '../../../../utils/EventsProperties';
import { EventStatus } from '../../../../utils/EventStatus';

import leftButton from '../../../../assets/gauche.png';
import rightButton from '../../../../assets/droite.png';

import EventBox from '../EventBox/EventBox';

import styles from './EventsList.module.css';
import { getEventsMiniature } from '../../../../utils/api';
import fallbackMiniature from '../../../../assets/logo_2lignes_crop.png';

interface EventsListProps {
  eventStatus: EventStatus;
  title: string;
  events: PublicEvent[];
  onPublish?: (eventId: string) => void;
  viewerID?: string;
}

const EventsList = (props: EventsListProps) => {
  const [index, setIndex] = useState(0);
  const [miniatureURLs, setMiniatureURLs] = useState<Record<string, string>>({});

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

  const fetchMiniatures = useCallback(async () => {
  const newURLs: Record<string, string> = {};

  await Promise.all(
    props.events.map(async (event) => {
      try {
        const res = await getEventsMiniature(event.id);
        if (res?.data?.url && !res.data.url.includes('imageSlug')) {
          newURLs[event.id] = res.data.url;
        } else {
          newURLs[event.id] = fallbackMiniature; 
        }
      } catch (err) {
        console.error(`Erreur récupération miniature pour event ${event.id}`, err);
        newURLs[event.id] = fallbackMiniature;
      }
    })
  );
  setMiniatureURLs(newURLs);
}, [props.events]);

  useEffect(() => {
    fetchMiniatures();
  }, [fetchMiniatures]);


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
              imageURL={miniatureURLs[event.id]}
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
