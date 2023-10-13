import React, { FC } from 'react';
import { ChangeEvent, FormEvent, useState, useEffect } from 'react';
import './events.css';

import Button from '../../components/buttons/button/button';
import Modal from '../../components/modal/modal';
import TextBox from '../../components/TextBox/TextBox';
import TextArea from '../../components/TextArea/TextArea';
import EventsList from './../../components/EventsList/EventsList';
import { Option } from '../../components/SelectBox/SelectBox';
import { SelectBox } from '../../components/SelectBox/SelectBox';
import { EventStatus } from '../../utils/EventStatus';

export interface eventsProps {}

const categories = ['BBL', 'Conférence'];

const fetchEventsNotPublished = async () => {
  try {
    const res = await fetch('http://localhost:3001/api/events?published=false');
    const finalRes = await res.json();
    return finalRes;
  } catch (error) {
    console.error(`Failed to fetch nonpublished events: ${error}`);
  }
};

const fetchEventsPublished = async () => {
  try {
    const res = await fetch('http://localhost:3001/api/events?published=true');
    const finalRes = await res.json();
    return finalRes;
  } catch (error) {
    console.error(`Failed to fetch nonpublished events: ${error}`);
  }
};

const EventsPage: FC<eventsProps> = () => {
  const [isOpen, setisOpen] = useState(false);
  const toggle = () => {
    setisOpen(!isOpen);
  };

  const [name, setName] = useState('');
  const [errorName, setErrorName] = useState(false);

  const [eventsPublished, setEventsPublished] = useState([]);
  const [eventsUnpublished, setEventsUnpublished] = useState([]);

  const [description, setDescription] = useState('');
  const [errorDescription, setErrorDescription] = useState(false);

  const [categoryValue, setCategoryValue] = useState('');

  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');

  const [message, setMessage] = useState('');

  // use effect called once to fetch published and unpublished events
  useEffect(() => {
    const fetchEventData = async () => {
      try {
        const publishedData = await fetchEventsPublished();
        const unpublishedData = await fetchEventsNotPublished();
        setEventsPublished(publishedData);
        setEventsUnpublished(unpublishedData);
      } catch (error) {
        console.error(`Failed to fetch events: ${error}`);
      }
    };

    fetchEventData();
  }, []);

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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorName(true);
    }
    if (!description.trim()) {
      setErrorDescription(true);
    }
    try {
      const res = await fetch('http://localhost:3001/api/events', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          description: description,
          category: categoryValue,
          tags: [],
          startDate: date + 'T' + startHour + ':00.000Z',
          endDate: date + 'T' + endHour + ':00.000Z',
          creator: 1,
          isPrivate: true,
          imageSlug: 'imageSlug',
        }),
      });
      if (res.status === 201) {
        toggle();
        setName('');
        setDescription('');
        setDate('');
        setStartHour('');
        setEndHour('');
        setCategoryValue('');
      }
    } catch (error) {
      console.log(error);
      setMessage("L'évènement n'a pas pu être créer, une erreur est survenue");
    }
  };

  return (
    <div className="events">
      <div className="button-event-creation">
        <Button onClick={toggle}>Créer un évènement</Button>
      </div>
      <div className="content">
        {eventsPublished && eventsPublished.length >= 1 ? (
          <EventsList
            eventStatus={EventStatus.Published}
            title="Published Events"
            events={eventsPublished}
          />
        ) : null}
        {eventsUnpublished && eventsUnpublished.length >= 1 ? (
          <EventsList
            eventStatus={EventStatus.NotPublished}
            title="Not Published Events"
            events={eventsUnpublished}
          />
        ) : null}
      </div>
      <Modal isOpen={isOpen} toggle={toggle}>
        <h1>Créer un nouvel évènement</h1>
        <form onSubmit={handleSubmit}>
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
          <Button className="submit-button" type="submit">
            Créer l&apos;évènement
          </Button>
          <div className="message">{message ? <p>{message}</p> : null}</div>
        </form>
      </Modal>
    </div>
  );
};

export default EventsPage;
