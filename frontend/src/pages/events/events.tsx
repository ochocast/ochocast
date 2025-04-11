import React, { ChangeEvent, FC, FormEvent, useEffect, useState } from 'react';
import './events.css';

import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import Modal from '../../components/modal/modal';

import TextArea from '../../components/ReworkComponents/generic/Text/TextArea/TextArea';
import TextBox from '../../components/ReworkComponents/generic/Text/TextBox/TextBox';
import EventsList from '../../components/ReworkComponents/Event/EventsList/EventsList';
import { Option, SelectBox } from '../../components/ReworkComponents/SelectBox/SelectBox';
import { EventStatus } from '../../utils/EventStatus';
import {
  getPublishedEvents,
  getUnpublishedEvents,
  getClosedEvents,
  updateEvent,
} from '../../utils/api';
import { createEvent } from '../../utils/api';
import Event from '../../utils/EventsProperties';
import logger from '../../utils/logger';

export interface eventsProps {}

const categories = ['BBL', 'Conférence'];

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

  const [categoryValue, setCategoryValue] = useState('');

  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');

  const [message, setMessage] = useState('');
  const userString = localStorage.getItem('backendUser');

  // use effect called once to fetch published and unpublished events
  useEffect(() => {
    const fetchEventData = async () => {
      try {
        if (!userString) {
          throw new Error('User not found');
        }
        const publishedData = await getPublishedEvents();
        const unpublishedData = await getUnpublishedEvents(
          JSON.parse(userString).id,
        );
        const closedData = await fetchEventsClosed();

        setEventsPublished(publishedData.data);
        setEventsUnpublished(unpublishedData.data);
        setEventsClosed(closedData);
      } catch (error) {
        logger.error(`Failed to fetch events: ${error}`);
      }
    };

    fetchEventData();
  }, [userString]);

  const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCategoryValue(event.target.value);
  };

  const options: Option[] = [
    { label: 'Select...', value: '' },
    ...categories.map((category) => ({ label: category, value: category })),
  ];

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
      const res = await updateEvent(eventId, { published: true });
      setEventsPublished((prevEvents) => [...prevEvents, res.data]);

      setEventsUnpublished([
        ...eventsUnpublished.filter((event) => event.id !== eventId),
      ]);
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
        if (!userString) {
          throw new Error('User not found');
        }
        const user = JSON.parse(userString);
        const res = await createEvent({
          name: name,
          description: description,
          category: categoryValue,
          tags: [],
          startDate: date + 'T' + startHour + ':00.000Z',
          endDate: date + 'T' + endHour + ':00.000Z',
          creator: user.id,
          isPrivate: true,
          imageSlug: 'imageSlug',
        });

        if (res.status === 201) {
          toggle();
          setName('');
          setDescription('');
          setDate('');
          setStartHour('');
          setEndHour('');
          setCategoryValue('');
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
            onPublish={onPublish}
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
            <SelectBox
              title="Catégorie"
              options={options}
              value={categoryValue}
              onChange={handleSelectChange}
              required={true}
            />
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
