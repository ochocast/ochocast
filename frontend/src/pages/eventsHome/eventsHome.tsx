import React, { useCallback, useEffect, useState } from 'react';
import SearchBar from '../../components/ReworkComponents/navigation/SearchBar/SearchBar';
import { useTranslation } from 'react-i18next';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import { useAuth } from 'react-oidc-context';
import { api } from '../../utils/api';

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
  const auth = useAuth();
  // Gardons userString pour référence mais non-utilisé
  // const userString = localStorage.getItem('backendUser');
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [miniatureURLs, setMiniatureURLs] = useState<Record<string, string>>(
    {},
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [fetchError, setFetchError] = useState<string | null>(null);

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
  }, [events]);  useEffect(() => {
    // Assurez-vous que les headers API sont configurés avec le token
    if (auth.user?.access_token) {
      api.setHeaders({Authorization: `Bearer ${auth.user.access_token}`});
    }

    const fetchEventData = async () => {
      setIsLoading(true);
      setFetchError(null);
      try {
        const res = await getPublishedEvents();
        if (res.status === 200) {
          setEvents(await res.data);
        }
      } catch (error) {
        logger.error(`Failed to fetch events: ${error}`);
        setFetchError("Impossible de charger les événements");
      }
      setIsLoading(false);
    };
    
    // Si on a un token et qu'on n'est pas en train de charger, on lance le fetch
    if (auth.user && !auth.isLoading) {
      fetchEventData();
    }
  }, [auth.user, auth.isLoading]);

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
          {isLoading ? (
            loading
          ) : fetchError ? (
            <div className={styles.errorMessage}>{fetchError}</div>
          ) : eventsBoxs.length > 0 ? (
            eventsBoxs
          ) : (
            <div className={styles.emptyState}>Aucun événement trouvé</div>
          )}
        </div>
      </div>
    </>
  );
};

export default EventsHomePage;
