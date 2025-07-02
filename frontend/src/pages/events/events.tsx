import React, { ChangeEvent, FC, FormEvent, useEffect, useState } from 'react';
import styles from './events.module.css';
import { useAuth } from 'react-oidc-context';
import { api } from '../../utils/api';

import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import Modal from '../../components/ReworkComponents/generic/modal/modal';

import TextArea from '../../components/ReworkComponents/generic/Text/TextArea/TextArea';
import TextBox from '../../components/ReworkComponents/generic/Text/TextBox/TextBox';
import SearchBar from '../../components/ReworkComponents/navigation/SearchBar/SearchBar';
import EventsList from '../../components/ReworkComponents/Event/EventsList/EventsList';
import { EventStatus } from '../../utils/EventStatus';
import {
  getPublishedEvents,
  getUnpublishedEvents,
  getClosedEvents,
  publishEvent,
} from '../../utils/api';
import { createEvent } from '../../utils/api';
import { eventToPublicEvent, PublicEvent } from '../../utils/EventsProperties';
import logger from '../../utils/logger';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';
import InputFile from '../../components/ReworkComponents/inputFile/InputFile';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export interface eventsProps {}

// Utility function to remove accents from a string
const removeAccents = (str: string): string =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Filtering function: searches in both "name" and "description" properties
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

const EventsPage: FC<eventsProps> = () => {
  const auth = useAuth();
  const [isOpen, setisOpen] = useState(false);
  const toggle = () => {
    setisOpen(!isOpen);
    // Réinitialiser l'état de création quand on ferme le modal
    if (isOpen) {
      setIsCreatingEvent(false);
    }
  };

  const [name, setName] = useState('');
  const [errorName, setErrorName] = useState(false);

  const [eventsPublished, setEventsPublished] = useState<PublicEvent[]>([]);
  const [eventsUnpublished, setEventsUnpublished] = useState<PublicEvent[]>([]);
  const [eventsClosed, setEventsClosed] = useState<PublicEvent[]>([]);

  const [description, setDescription] = useState('');
  const [errorDescription, setErrorDescription] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');

  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');

  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [toast, setToast] = useState<{
    message: string;
    type?: 'success' | 'error' | 'info';
  } | null>(null);

  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isCreatingEvent, setIsCreatingEvent] = useState<boolean>(false);

  const fetchEventData = async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const publishedData = await getPublishedEvents();
      const unpublishedData = await getUnpublishedEvents();
      const closedData = await getClosedEvents();

      if (publishedData.status !== 200)
        throw new Error('Échec récupération événements publiés');
      if (unpublishedData.status !== 200)
        throw new Error('Échec récupération événements non publiés');
      if (closedData.status !== 200)
        throw new Error('Échec récupération événements clos');

      setEventsPublished(publishedData.data);
      setEventsUnpublished(unpublishedData.data);
      setEventsClosed(closedData.data);
    } catch (error) {
      logger.error(`Failed to fetch events: ${error}`);
      setFetchError('Impossible de charger les événements');
    }
    setIsLoading(false);
  };

  // Use effect for fetching events when auth changes
  useEffect(() => {
    // Assurez-vous que les headers API sont configurés avec le token
    if (auth.user?.access_token) {
      api.setHeaders({ Authorization: `Bearer ${auth.user.access_token}` });
    }

    // Seulement si on a un token et qu'on n'est pas en train de charger
    if (auth.user && !auth.isLoading) {
      fetchEventData();
    }
  }, [auth.user, auth.isLoading]);

  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };
  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
  };

  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
  };
  const handleStartHourChange = (e: ChangeEvent<HTMLInputElement>) => {
    setStartHour(e.target.value);
  };
  const handleEndHourChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEndHour(e.target.value);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files ? e.target.files[0] : null;
    if (file) {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImageUrl(reader.result);
        } else {
          console.error("Le résultat du FileReader n'est pas une chaîne !");
        }
      };

      reader.readAsDataURL(file);
      setSelectedImage(file);
    }
  };

  const { t } = useTranslation();

  const onPublish = async (eventId: string) => {
    try {
      // Assurez-vous que le token est toujours valide
      if (auth.user?.access_token) {
        api.setHeaders({ Authorization: `Bearer ${auth.user.access_token}` });
      }

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

        setEventsPublished((prevEvents) => [...prevEvents, res.data]);

        setEventsUnpublished([
          ...eventsUnpublished.filter((event) => event.id !== eventId),
        ]);
        fetchEventData();
      }
    } catch (error) {
      logger.error(`Failed to update event: ${error}`);
      setToast({
        message: t('ErrorPublishingEvent'),
        type: 'error',
      });
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Empêcher les double-clics
    if (isCreatingEvent) {
      return;
    }

    let isError = false;
    if (!name.trim()) {
      setErrorName(true);
      isError = true;
    }
    if (!description.trim()) {
      setErrorDescription(true);
      isError = true;
    }

    if (!isError) {
      setIsCreatingEvent(true); // Désactiver le bouton
      try {
        // Assurez-vous que le token est toujours valide
        if (auth.user?.access_token) {
          api.setHeaders({ Authorization: `Bearer ${auth.user.access_token}` });
        } else {
          throw new Error('Session expirée, veuillez vous reconnecter');
        }

        const [year, month, day] = date.split('-');
        const [s_hour, s_minute] = startHour.split(':');
        const [e_hour, e_minute] = endHour.split(':');
        const startDateISOString = new Date(
          Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(s_hour),
            parseInt(s_minute),
          ),
        ).toISOString();
        const endDateISOString = new Date(
          Date.UTC(
            parseInt(year),
            parseInt(month) - 1,
            parseInt(day),
            parseInt(e_hour),
            parseInt(e_minute),
          ),
        ).toISOString();
        const formData = new FormData();
        formData.append('image_slug', selectedImage?.name || 'imageslug');
        formData.append('name', name);
        formData.append('description', description);
        formData.append('startDate', startDateISOString);
        formData.append('endDate', endDateISOString);
        if (selectedImage) {
          formData.append('miniature', selectedImage);
        }
        const res = await createEvent(formData);

        if (res.status === 201) {
          setToast({
            message: t('EventSuccessfullyCreated'),
            type: 'success',
          });
          toggle();
          setName('');
          setDescription('');
          setDate('');
          setStartHour('');
          setEndHour('');
          setSelectedImage(null);
          setImageUrl(null);
          setEventsUnpublished((prevEvents) => [
            ...prevEvents,
            eventToPublicEvent(res.data),
          ]);
          // Actualiser tous les événements après la création
          fetchEventData();
          setIsCreatingEvent(false); // Réactiver après succès et nettoyage
        } else {
          throw new Error("Erreur de création d'événement");
        }
      } catch (error) {
        setToast({
          message: t('ErrorCreatingEvent'),
          type: 'error',
        });
        logger.error(error);
        setMessage(t('ErrorCreationEvent'));
        setIsCreatingEvent(false); // Réactiver en cas d'erreur
      }
    }
  };

  const filteredPublished =
    searchQuery === ''
      ? eventsPublished
      : filterEvents(eventsPublished, searchQuery);
  const filteredUnpublished =
    searchQuery === ''
      ? eventsUnpublished
      : filterEvents(eventsUnpublished, searchQuery);
  const filteredClosed =
    searchQuery === '' ? eventsClosed : filterEvents(eventsClosed, searchQuery);

  // Obtenir l'ID utilisateur depuis le contexte d'authentification
  const userId = auth.user?.profile?.sub || '';

  return (
    <div className={styles.events}>
      <header className="events-header">
        <div className={styles.searchContainer}>
          <SearchBar
            onClick={handleSearch}
            needInput={true}
            placeholder={t('searchAnEvent')}
          />
        </div>
      </header>
      <div className={styles.buttonEventCreation}>
        <Link to="/events/create">
          <Button label={t('CreateAnEvent')} type={ButtonType.primary} />
        </Link>
      </div>
      <div className={styles.content}>
        {isLoading ? (
          <div className={styles.loadingMessage}>
            Chargement des événements...
          </div>
        ) : fetchError ? (
          <div className={styles.errorMessage}>{fetchError}</div>
        ) : (
          <>
            {filteredPublished && filteredPublished.length >= 1 ? (
              <EventsList
                eventStatus={EventStatus.Published}
                title={t('UpcomingEvents')}
                events={filteredPublished}
                viewerID={userId}
              />
            ) : null}
            {filteredUnpublished && filteredUnpublished.length >= 1 ? (
              <EventsList
                eventStatus={EventStatus.NotPublished}
                title={t('UnpublishedEvents')}
                events={filteredUnpublished}
                onPublish={onPublish}
              />
            ) : null}
            {filteredClosed && filteredClosed.length >= 1 ? (
              <EventsList
                eventStatus={EventStatus.Finished}
                title={t('PastEvents')}
                events={filteredClosed}
              />
            ) : null}
            {filteredPublished.length === 0 &&
              filteredUnpublished.length === 0 &&
              filteredClosed.length === 0 && (
                <div className={styles.emptyState}>Aucun événement trouvé</div>
              )}
          </>
        )}
      </div>
      <Modal isOpen={isOpen} toggle={toggle}>
        <h1>{t('CreateNewEvent')}</h1>
        <form className={styles.addEventForm} onSubmit={handleSubmit}>
          <div className={styles.sideBySide}>
            <TextBox
              type="text"
              label={t('NameEvent')}
              placeholder={t('MyEvent')}
              value={name}
              name={t('Name')}
              error={errorName}
              onChange={handleNameChange}
            />
            <div className={styles.inputWrapper}>
              <label>{t('DateEvent')}</label>
              <input
                type="date"
                name={t('Date')}
                value={date}
                min={new Date().toISOString().split('T')[0]}
                onChange={handleDateChange}
                required
              />
            </div>
            <div className={styles.inputWrapper}>
              <label>{t('StartEvent')}</label>
              <input
                type="time"
                name={t('Time')}
                value={startHour}
                onChange={handleStartHourChange}
                required
              />
            </div>
            <div className={styles.inputWrapper}>
              <label>{t('EndEvent')}</label>
              <input
                type="time"
                name={t('Time')}
                min={startHour}
                value={endHour}
                onChange={handleEndHourChange}
                required
              />
            </div>
            <div className={styles.inputWrapper}>
              <label>{t('Thumbnail')}</label>
              <InputFile
                placeholder={t('ChooseThumbnail')}
                onChange={handleImageChange}
                disable={false}
                required={false}
              />
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Miniature Preview"
                  style={{
                    width: '100px',
                    height: '100px',
                    objectFit: 'cover',
                  }}
                />
              )}
            </div>
          </div>
          <TextArea
            label={t('EventDescription')}
            placeholder={t('DescriptionEvent')}
            value={description}
            name={t('DescriptionEvent2')}
            error={errorDescription}
            onChange={handleDescriptionChange}
          />
          <Button
            label={isCreatingEvent ? t('CreatingEvent') : t('CreateEvent')}
            type={isCreatingEvent ? ButtonType.disabled : ButtonType.primary}
          />
          <div className="message">{message ? <p>{message}</p> : null}</div>
        </form>
      </Modal>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
};

export default EventsPage;
