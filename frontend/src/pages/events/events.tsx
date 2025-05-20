import React, { ChangeEvent, FC, FormEvent, useEffect, useState } from 'react';
import './events.css';

import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import Modal from '../../components/modal/modal';

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
import { PublicEvent } from '../../utils/EventsProperties';
import logger from '../../utils/logger';
import Toast from '../../components/ReworkComponents/generic/Toast/Toast';

export interface eventsProps {}

// Utility function to remove accents from a string
const removeAccents = (str: string): string =>
  str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Filtering function: searches in both "name" and "description" properties
const filterEvents = (events: PublicEvent[], query: string): PublicEvent[] => {
  if (!events) return [];
  const queryNormalized = removeAccents(query.toLowerCase());
  return events.filter(event => {
    const nameNormalized = removeAccents(event.name.toLowerCase());
    const descNormalized = removeAccents(event.description.toLowerCase());
    return nameNormalized.includes(queryNormalized) || descNormalized.includes(queryNormalized);
  });
};

const fetchEventsClosed = async () => {
  try {
    const res = await getClosedEvents();
    return await res.data;
  } catch (error) {
    logger.error(`Failed to fetch published events: ${error}`);
  }
};

const EventsPage: FC<eventsProps> = () => {
  const [isOpen, setisOpen] = useState(false);
  const toggle = () => {
    setisOpen(!isOpen);
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
  const userString = localStorage.getItem('backendUser');

  const [toast, setToast] = useState<{ message: string; type?: "success" | "error" | "info" } | null>(null);


  const fetchEventData = async (userString: string | null) => {
    try {
      if (!userString) {
        throw new Error('User not found');
      }
      const publishedData = await getPublishedEvents();
      const unpublishedData = await getUnpublishedEvents();
      const closedData = await fetchEventsClosed();

      setEventsPublished(publishedData.data);
      setEventsUnpublished(unpublishedData.data);
      setEventsClosed(closedData);
    } catch (error) {
      logger.error(`Failed to fetch events: ${error}`);
    }
  };

  // use effect called once to fetch published and unpublished events
  useEffect(() => {
    const fetchEventData = async () => {
      try {
        const publishedData = await getPublishedEvents();
        const unpublishedData = await getUnpublishedEvents();
        const closedData = await fetchEventsClosed();

        setEventsPublished(publishedData.data);
        setEventsUnpublished(unpublishedData.data);
        setEventsClosed(closedData);
      } catch (error) {
        logger.error(`Failed to fetch events: ${error}`);
      }
    };

    fetchEventData();
  }, []);

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

  const onPublish = async (eventId: string) => {
    try {
      const res = await publishEvent(eventId);
      if (res.status !== 200) {
        setToast({ message: "Erreur lors de la publication de l'évènement", type: "error" });
      } else {
        setToast({ message: "Évènement publié avec succès !", type: "success" });
      }
      setEventsPublished((prevEvents) => [...prevEvents, res.data]);

      setEventsUnpublished([
        ...eventsUnpublished.filter((event) => event.id !== eventId),
      ]);
      fetchEventData(userString);
    } catch (error) {
      logger.error(`Failed to update event: ${error}`);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
      try {
        const [year, month, day] = date.split('-');
        const [s_hour, s_minute] = startHour.split(':');
        const [e_hour, e_minute] = endHour.split(':');

        const res = await createEvent({
          name: name,
          description: description,
          startDate: new Date(
            Date.UTC(
              parseInt(year),
              parseInt(month) - 1, // Les mois vont de 0 à 11
              parseInt(day),
              parseInt(s_hour),
              parseInt(s_minute),
            ),
          ).toISOString(),
          endDate: new Date(
            Date.UTC(
              parseInt(year),
              parseInt(month) - 1,
              parseInt(day),
              parseInt(e_hour),
              parseInt(e_minute),
            ),
          ).toISOString(),
          imageSlug: 'imageSlug',
        });

        if (res.status === 201) {
          setToast({ message: "Évènement créé avec succès !", type: "success" });
          toggle();
          setName('');
          setDescription('');
          setDate('');
          setStartHour('');
          setEndHour('');
          setEventsUnpublished((prevEvents) => [...prevEvents, res.data]);
        }
      } catch (error) {
        setToast({ message: "Erreur lors de la création de l'évènement", type: "error" });
        logger.error(error);
        setMessage(
          "L'évènement n'a pas pu être créer, une erreur est survenue",
        );
      }
    }
  };

  const filteredPublished = searchQuery === '' ? eventsPublished : filterEvents(eventsPublished, searchQuery);
  const filteredUnpublished = searchQuery === '' ? eventsUnpublished : filterEvents(eventsUnpublished, searchQuery);
  const filteredClosed = searchQuery === '' ? eventsClosed : filterEvents(eventsClosed, searchQuery);

  return (
    <div className="events">
    <header className="events-header">
       <div className="search-container">
         <SearchBar onClick={handleSearch} needInput={true} placeholder="Rechercher un évènement..." />
       </div>
     </header>
      <div className="button-event-creation">
        <Button
          label="Créer un évènement"
          type={ButtonType.primary}
          onClick={toggle}
        />
      </div>
      <div className="content">
        {filteredPublished && filteredPublished.length >= 1 ? (
          <EventsList
            eventStatus={EventStatus.Published}
            title="Prochain évènements"
            events={filteredPublished}
            viewerID={userString ? JSON.parse(userString).id : ''}
          />
        ) : null}
        {filteredUnpublished && filteredUnpublished.length >= 1 ? (
          <EventsList
            eventStatus={EventStatus.NotPublished}
            title="Évènements non publiés"
            events={filteredUnpublished}
            onPublish={onPublish}
          />
        ) : null}
        {filteredClosed && filteredClosed.length >= 1 ? (
          <EventsList
            eventStatus={EventStatus.Finished}
            title="Évènements passé"
            events={filteredClosed}
          />
        ) : null}
      </div>
      <Modal isOpen={isOpen} toggle={toggle}>
        <h1>Créer un nouvel évènement</h1>
        <form className="add-event-form" onSubmit={handleSubmit}>
          <div className="side-by-side">
            <TextBox
              type="text"
              label="Nom de l'évènement"
              placeholder="Mon évènement"
              value={name}
              name="name"
              error={errorName}
              onChange={handleNameChange}
            />
            <div className="input-wrapper">
              <label>Date de l&apos;évènement</label>
              <input
                type="date"
                name="date"
                value={date}
                min={new Date().toISOString().split('T')[0]}
                onChange={handleDateChange}
                required
              />
            </div>
            <div className="input-wrapper">
              <label>Début de l&apos;évènement</label>
              <input
                type="time"
                name="time"
                value={startHour}
                onChange={handleStartHourChange}
                required
              />
            </div>
            <div className="input-wrapper">
              <label>Fin de l&apos;évènement</label>
              <input
                type="time"
                name="time"
                min={startHour}
                value={endHour}
                onChange={handleEndHourChange}
                required
              />
            </div>
          </div>
          <TextArea
            label="Description de l'évènement"
            placeholder="Description..."
            value={description}
            name="description"
            error={errorDescription}
            onChange={handleDescriptionChange}
          />
          <Button label="Créer l'évènement" type={ButtonType.primary} />
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
