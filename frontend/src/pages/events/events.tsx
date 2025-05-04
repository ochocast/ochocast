import React, { ChangeEvent, FC, FormEvent, useEffect, useState } from 'react';
import './events.css';

import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import Modal from '../../components/modal/modal';

import TextArea from '../../components/ReworkComponents/generic/Text/TextArea/TextArea';
import TextBox from '../../components/ReworkComponents/generic/Text/TextBox/TextBox';
import EventsList from '../../components/ReworkComponents/Event/EventsList/EventsList';
import { EventStatus } from '../../utils/EventStatus';
import {
  getPublishedEvents,
  getUnpublishedEvents,
  getClosedEvents,
  publishEvent,
} from '../../utils/api';
import { createEvent } from '../../utils/api';
import Event from '../../utils/EventsProperties';
import logger from '../../utils/logger';

export interface eventsProps {}

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

  const [eventsPublished, setEventsPublished] = useState<Event[]>([]);
  const [eventsUnpublished, setEventsUnpublished] = useState<Event[]>([]);
  const [eventsClosed, setEventsClosed] = useState<Event[]>([]);

  const [description, setDescription] = useState('');
  const [errorDescription, setErrorDescription] = useState(false);

  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');

  const [message, setMessage] = useState('');
  const userString = localStorage.getItem('backendUser');

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

  const onPublish = async (eventId: string) => {
    try {
      const res = await publishEvent(eventId);
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
          toggle();
          setName('');
          setDescription('');
          setDate('');
          setStartHour('');
          setEndHour('');
          setEventsUnpublished((prevEvents) => [...prevEvents, res.data]);
        }
      } catch (error) {
        logger.error(error);
        setMessage(
          "L'évènement n'a pas pu être créer, une erreur est survenue",
        );
      }
    }
  };

  return (
    <div className="events">
      <div className="button-event-creation">
        <Button
          label="Créer un évènement"
          type={ButtonType.primary}
          onClick={toggle}
        />
      </div>
      <div className="content">
        {eventsPublished && eventsPublished.length >= 1 ? (
          <EventsList
            eventStatus={EventStatus.Published}
            title="Prochain évènements"
            events={eventsPublished}
            viewerID={userString ? JSON.parse(userString).id : ''}
          />
        ) : null}
        {eventsUnpublished && eventsUnpublished.length >= 1 ? (
          <EventsList
            eventStatus={EventStatus.NotPublished}
            title="Évènements non publiés"
            events={eventsUnpublished}
            onPublish={onPublish}
          />
        ) : null}
        {eventsClosed && eventsClosed.length >= 1 ? (
          <EventsList
            eventStatus={EventStatus.Finished}
            title="Évènements passé"
            events={eventsClosed}
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
    </div>
  );
};

export default EventsPage;
