import React, { useCallback, useEffect, useState } from 'react';
import SearchBar from '../../components/ReworkComponents/navigation/SearchBar/SearchBar';
import { useTranslation } from 'react-i18next';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';

import styles from './eventsHome.module.css';
import DisableEventBox from '../../components/ReworkComponents/Event/EventBox/DisableEventBox/DisableEventBox';
import { PublicEvent } from '../../utils/EventsProperties';
import { EventStatus } from '../../utils/EventStatus';
import EventBox from '../../components/ReworkComponents/Event/EventBox/EventBox';
import { getEventsMiniature, getPublishedEvents } from '../../utils/api';
import fallbackMiniature from '../../assets/logo_2lignes_crop.png';
import logger from '../../utils/logger';
import { useNavigate } from 'react-router-dom';

const removeAccents = (str: string): string =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const filterEvents = (events: PublicEvent[], query: string): PublicEvent[] => {
  if (!events) return [];
  const queryNormalized = removeAccents(query.toLowerCase());
  return events.filter((event) => {
    const nameNormalized = removeAccents(event.name.toLowerCase());
    const descNormalized = removeAccents(event.description.toLowerCase());
    return (
      nameNormalized.includes(queryNormalized) ||
      descNormalized.includes(queryNormalized)
    );
  });
};

const EventsHomePage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [miniatureURLs, setMiniatureURLs] = useState<Record<string, string>>(
    {},
  );
  const [searchQuery, setSearchQuery] = useState('');

  const fetchMiniatures = useCallback(async () => {
    const newURLs: Record<string, string> = {};

    await Promise.all(
      events.map(async (event) => {
        try {
          const res = await getEventsMiniature(event.id);
          if (res?.data?.url && !res.data.url.includes('imageSlug')) {
            newURLs[event.id] = res.data.url;
          } else {
            newURLs[event.id] = fallbackMiniature;
          }
        } catch (err) {
          console.error(
            `Erreur récupération miniature pour event ${event.id}`,
            err,
          );
          newURLs[event.id] = fallbackMiniature;
        }
      }),
    );
    setMiniatureURLs(newURLs);
  }, [events]);

  useEffect(() => {
    const fetchEventData = async () => {
      try {
        const res = await getPublishedEvents();
        if (res.status != 200) throw new res.data();
        setEvents(res.data);
        setIsLoading(false);
      } catch (error) {
        logger.error(`Failed to fetch events: ${error}`);
      }
    };
    fetchEventData();
  }, []);

  useEffect(() => {
    fetchMiniatures();
  }, [fetchMiniatures]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const filteredEvents =
    searchQuery === '' ? events : filterEvents(events, searchQuery);

  const loading = Array.from({ length: 10 }, (_, i) => (
    <DisableEventBox key={i} />
  ));

  const eventsBoxs = filteredEvents.map((event: PublicEvent) => {
    return (
      <EventBox
        event={event}
        eventStatus={EventStatus.Published}
        key={event.id}
        imageURL={miniatureURLs[event.id]}
      />
    );
  });

  return (
    <>
      <div className={styles.header}>
        <div className={styles.searchContainer}>
          <SearchBar
            onClick={handleSearch}
            needInput={true}
            placeholder={t('searchAnEvent')}
            hasSugestion={false}
          />
        </div>
        <div className={styles.checkBoxSubscribeEventWrapper}>
          <input
            className={styles.checkBoxSubscribeEvent}
            type="checkbox"
            checked={false}
            onChange={() => {
              /*TODO*/
            }}
          />
          {t('isRegistered')}
        </div>
        <Button
          label={t('myEvents')}
          type={ButtonType.primary}
          onClick={() => navigate('/my-events')}
        />
      </div>
      <div className={styles.body}>
        <h1>{t('UpcomingEvents')}</h1>
        <div className={styles.wrapperEvents}>
          {isLoading ? loading : eventsBoxs}
        </div>
      </div>
    </>
  );
};

export default EventsHomePage;
