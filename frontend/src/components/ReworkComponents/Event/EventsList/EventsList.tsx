import React, { useCallback, useEffect, useState } from 'react';
import { PublicEvent } from '../../../../utils/EventsProperties';
import { EventStatus } from '../../../../utils/EventStatus';

import EventBox from '../EventBox/EventBox';
import ArrowIcon from './ArrowIcon';

import styles from './EventsList.module.css';
import { getEventsMiniature } from '../../../../utils/api';
import { useBrandingContext } from '../../../../context/BrandingContext';
interface EventsListProps {
  eventStatus: EventStatus;
  title: string;
  events: PublicEvent[];
  onPublish?: (eventId: string) => void;
  onSubscriptionChange?: () => void;
  viewerID?: string;
}

const EventsList = (props: EventsListProps) => {
  const [index, setIndex] = useState(0);
  const [miniatureURLs, setMiniatureURLs] = useState<Record<string, string>>(
    {},
  );
  const { getImageUrl } = useBrandingContext();
  const [fallbackMiniatureUrl, setFallbackMiniatureUrl] = useState<
    string | null
  >(null);

  useEffect(() => {
    const fetchFallbackMiniature = async () => {
      try {
        const url = await getImageUrl('default_miniature_image');
        setFallbackMiniatureUrl(url);
      } catch (error) {
        console.error('Error fetching fallback miniature:', error);
      }
    };
    fetchFallbackMiniature();
  }, [getImageUrl]);

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

  const buttonGen = (direction: 'left' | 'right', onClick: () => void) => (
    <ArrowIcon
      direction={direction}
      color="var(--arrow-color)"
      size={128}
      className={styles.arrow}
      onClick={onClick}
    />
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
            newURLs[event.id] =
              fallbackMiniatureUrl || '/exemple/image_tuile_event.png';
          }
        } catch (err) {
          console.error(
            `Erreur récupération miniature pour event ${event.id}`,
            err,
          );
          newURLs[event.id] =
            fallbackMiniatureUrl || '/exemple/image_tuile_event.png';
        }
      }),
    );
    setMiniatureURLs(newURLs);
  }, [props.events, fallbackMiniatureUrl]);

  useEffect(() => {
    fetchMiniatures();
  }, [fetchMiniatures]);

  return (
    <div className={styles.eventsList}>
      <div className={styles.title}>{props.title}</div>
      <div className={styles.list}>
        {props.events.length > 3 &&
          buttonGen('left', () => onArrowClick(false))}
        <div className={styles.container}>
          {eventsShown.map((event) => (
            <EventBox
              event={event}
              eventStatus={props.eventStatus}
              key={event.id}
              imageURL={miniatureURLs[event.id]}
              onPublish={props.onPublish}
              onSubscriptionChange={props.onSubscriptionChange}
            />
          ))}
        </div>
        {props.events.length > 3 &&
          buttonGen('right', () => onArrowClick(true))}
      </div>
    </div>
  );
};

export default EventsList;
