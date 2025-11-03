import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { api } from '../../utils/api';

import styles from './myEvents.module.css';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import SearchBar from '../../components/ReworkComponents/navigation/SearchBar/SearchBar';
import { useTranslation } from 'react-i18next';
import { PublicEvent } from '../../utils/EventsProperties';
import {
  getClosedEvents,
  getEventsMiniature,
  getPublishedEvents,
  getUnpublishedEvents,
  publishEvent,
} from '../../utils/api';
import { useBrandingContext } from '../../context/BrandingContext';
import logger from '../../utils/logger';
import DisableEventBox from '../../components/ReworkComponents/Event/EventBox/DisableEventBox/DisableEventBox';
import EventBox from '../../components/ReworkComponents/Event/EventBox/EventBox';
import { EventStatus } from '../../utils/EventStatus';
import EventsList from '../../components/ReworkComponents/Event/EventsList/EventsList';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';
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

const MyEvents = () => {
  const auth = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { getImageUrl } = useBrandingContext();

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [publishEvents, setPublishEvents] = useState<PublicEvent[]>([]);
  const [unpublishEvents, setUnpublishEvents] = useState<PublicEvent[]>([]);
  const [closeEvents, setCloseEvents] = useState<PublicEvent[]>([]);
  const [miniatureURLs, setMiniatureURLs] = useState<Record<string, string>>(
    {},
  );
  const [fallbackMiniatureUrl, setFallbackMiniatureUrl] = useState<
    string | null
  >(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);

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

  const fetchMiniatures = useCallback(async () => {
    const newURLs: Record<string, string> = {};

    await Promise.all(
      publishEvents
        .concat(unpublishEvents)
        .concat(closeEvents)
        .map(async (event) => {
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
  }, [publishEvents, unpublishEvents, closeEvents, fallbackMiniatureUrl]);

  const fetchEventData = async () => {
    setIsLoading(true);
    try {
      const resPublishEvent = await getPublishedEvents();
      const resNotPublishEvent = await getUnpublishedEvents();
      const resClosedEvent = await getClosedEvents();

      if (resPublishEvent.status !== 200)
        throw new Error('Échec récupération événements publiés');
      if (resNotPublishEvent.status !== 200)
        throw new Error('Échec récupération événements non publiés');
      if (resClosedEvent.status !== 200)
        throw new Error('Échec récupération événements clos');

      setPublishEvents(
        resPublishEvent.data.filter((e: PublicEvent) => e.canBeEditByUser),
      );
      setUnpublishEvents(resNotPublishEvent.data);
      setCloseEvents(
        resClosedEvent.data.filter((e: PublicEvent) => e.canBeEditByUser),
      );
    } catch (error) {
      logger.error(`Failed to fetch events: ${error}`);
      setFetchError('Impossible de charger vos événements');
    }
    setIsLoading(false);
  };
  useEffect(() => {
    // Assurez-vous que les headers API sont configurés avec le token
    if (auth.user?.access_token) {
      api.setHeaders({ Authorization: `Bearer ${auth.user.access_token}` });
    }

    // Seulement si on a un token et qu'on n'est pas en train de charger
    if (auth.user && !auth.isLoading) {
      setFetchError(null);
      fetchEventData();
    }
  }, [auth.user, auth.isLoading]);

  useEffect(() => {
    fetchMiniatures();
  }, [fetchMiniatures]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const onPublish = async (eventId: string) => {
    try {
      const res = await publishEvent(eventId);

      if (res.status !== 200) {
        setToast({
          message: t('ErrorPublishingEvent'),
          type: 'error',
        });
      } else {
        setToast({
          message: t('EventSuccessfullyPublished'),
          type: 'success',
        });

        setPublishEvents((prevEvents) => [...prevEvents, res.data]);

        setUnpublishEvents((prevEvents) => [
          ...prevEvents.filter((event) => event.id !== eventId),
        ]);
        fetchEventData();
      }
    } catch (error) {
      logger.error(`Failed to update event: ${error}`);
    }
  };

  const filteredPublishEvents =
    searchQuery === ''
      ? publishEvents
      : filterEvents(publishEvents, searchQuery);
  const filteredUnpublishEvents =
    searchQuery === ''
      ? unpublishEvents
      : filterEvents(unpublishEvents, searchQuery);
  const filteredClosedEvents =
    searchQuery === '' ? closeEvents : filterEvents(closeEvents, searchQuery);

  const loading = Array.from({ length: 10 }, (_, i) => (
    <DisableEventBox key={i} />
  ));

  const eventsBoxs = filteredClosedEvents.map((event: PublicEvent) => {
    return (
      <EventBox
        event={event}
        eventStatus={EventStatus.Finished}
        key={event.id}
        imageURL={miniatureURLs[event.id]}
        onSubscriptionChange={fetchEventData}
      />
    );
  });

  return (
    <>
      <div className={styles.header}>
        <NavigateBackButton />
        <div className={styles.searchContainer}>
          <SearchBar
            onClick={handleSearch}
            needInput={true}
            placeholder={t('searchAnEvent')}
            hasSugestion={false}
          />
        </div>
        <Button
          label={t('CreateAnEvent')}
          type={ButtonType.primary}
          onClick={() => navigate('/my-events/create')}
        />
      </div>
      <div className={styles.body}>
        <div className={styles.wrapperEvents}>
          {isLoading ? (
            <div className={styles.wrapperCloseEvents}>{loading}</div>
          ) : fetchError ? (
            <div className={styles.errorMessage}>{fetchError}</div>
          ) : (
            <>
              {filteredPublishEvents.length > 0 && (
                <EventsList
                  eventStatus={EventStatus.Published}
                  title={t('PublicEvents')}
                  events={filteredPublishEvents}
                  onSubscriptionChange={fetchEventData}
                />
              )}
              {filteredUnpublishEvents.length > 0 && (
                <EventsList
                  eventStatus={EventStatus.NotPublished}
                  title={t('UnpublishedEvents')}
                  events={filteredUnpublishEvents}
                  onPublish={onPublish}
                  onSubscriptionChange={fetchEventData}
                />
              )}
              {filteredClosedEvents.length > 0 && (
                <>
                  <div className={styles.closeTitle}>{t('ClosedEvents')}</div>
                  <div className={styles.wrapperCloseEvents}>{eventsBoxs}</div>
                </>
              )}
              {filteredPublishEvents.length === 0 &&
                filteredUnpublishEvents.length === 0 &&
                filteredClosedEvents.length === 0 && (
                  <div className={styles.emptyState}>
                    Aucun événement trouvé
                  </div>
                )}
            </>
          )}
        </div>
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
};

export default MyEvents;
