import { FC, useState, ChangeEvent, FormEvent, useEffect } from 'react';
import React from 'react';
import './eventSettings.css';
import TextBox from '../../components/TextBox/TextBox';
import TextArea from '../../components/TextArea/TextArea';
import { Option, SelectBox } from '../../components/SelectBox/SelectBox';
import Button from '../../components/buttons/button/button';
import { useNavigate, useParams } from 'react-router-dom';
import DropDownMenuTracks from '../../components/DropDownMenuTracks/DropDownMenuTracks';
import { getTracks, getEvent, updateEvent } from '../../utils/api';
import trackSelectImage from '../../assets/tracksIconeSelect.png';
import rouageImage from '../../assets/rouage.svg';
import { Track } from '../../utils/EventsProperties';

interface EventSettingsProps {}

const EventSettings: FC<EventSettingsProps> = () => {
  const { eventId } = useParams();

  const [isButtonDisabled, setButtonDisabled] = useState(true);

  const [name, setName] = useState('');
  const [errorName, setErrorName] = useState(false);
  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setButtonDisabled(false);
    setMessage('');
  };

  const [description, setDescription] = useState('');
  const [errorDescription, setErrorDescription] = useState(false);
  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    setButtonDisabled(false);
    setMessage('');
  };

  const [date, setDate] = useState('');
  const [startHour, setStartHour] = useState('');
  const [endHour, setEndHour] = useState('');
  const handleDateChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDate(e.target.value);
    setButtonDisabled(false);
    setMessage('');
  };
  const handleStartHourChange = (e: ChangeEvent<HTMLInputElement>) => {
    setStartHour(e.target.value);
    setButtonDisabled(false);
    setMessage('');
  };
  const handleEndHourChange = (e: ChangeEvent<HTMLInputElement>) => {
    setEndHour(e.target.value);
    setButtonDisabled(false);
    setMessage('');
  };

  const [categoryValue, setCategoryValue] = useState('');
  const handleSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setCategoryValue(event.target.value);
    setButtonDisabled(false);
    setMessage('');
  };

  const categories = ['BBL', 'Conférence'];
  const options: Option[] = [
    { label: 'Select...', value: '' },
    ...categories.map((category) => ({ label: category, value: category })),
  ];

  const [message, setMessage] = useState('');

  const navigate = useNavigate();

  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        const res = await getTracks();
        if (res.status === 200) {
          setTracks(res.data);
        }
      } catch (error) {
        console.error(`Failed to fetch tracks: ${error}`);
      }
    };
    fetchTracks();

    const fetchEvent = async () => {
      try {
        const res = await getEvent(eventId);
        if (res.status === 200) {
          setName(res.data[0].name);
          setDescription(res.data[0].description);
          setCategoryValue(res.data[0].category);
          setDate(res.data[0].startDate.split('T')[0]);
          setStartHour(res.data[0].startDate.match(/\d{2}:\d{2}/)?.[0] || '');
          setEndHour(res.data[0].endDate.match(/\d{2}:\d{2}/)?.[0] || '');
        }
      } catch (error) {
        console.error(`Failed to fetch event: ${error}`);
      }
    };
    fetchEvent();
  }, [eventId]);

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
        const res = await updateEvent(eventId, {
          name: name,
          description: description,
          category: categoryValue,
          tags: [],
          startDate: date + 'T' + startHour + ':00.000Z',
          endDate: date + 'T' + endHour + ':00.000Z',
          isPrivate: true,
        });

        if (res.status === 200) {
          setMessage("L'évènement a bien été modifié");
          setButtonDisabled(true);
        }
      } catch (error) {
        console.log(error);
        setMessage(
          "L'évènement n'a pas pu être modifié, une erreur est survenue",
        );
      }
    }
  };

  return (
    <div className="page-event-settings">
      <div className="navigation">
        <h1>Tableau de bord</h1>
        <div className="settings-img-button">
          <img className="image-settings" src={rouageImage} alt="iconeSelect" />
          <button
            className="button-settings"
            type="button"
            onClick={() => navigate(`/events/${eventId}/event-settings`)}
          >
            Paramètres
          </button>
        </div>
        <DropDownMenuTracks
          tracks={tracks}
          eventId={eventId}
          isButtonDisplayed={true}
          imageUrl={trackSelectImage}
        />
      </div>
      <form onSubmit={handleSubmit} className="event-settings">
        <h1>Modifier l&apos;évènement</h1>
        <TextBox
          type="text"
          label="Nom"
          placeholder="Nom de l'évènement"
          name={name}
          value={name}
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
        <TextArea
          label="Description"
          placeholder="Description de l'évenement"
          value={description}
          name="description"
          error={errorDescription}
          onChange={handleDescriptionChange}
        />
        <Button
          className="submit-button"
          type="submit"
          disabled={isButtonDisabled}
        >
          Sauvergarder
        </Button>
        <div className="message">{message ? <p>{message}</p> : null}</div>
      </form>
    </div>
  );
};

export default EventSettings;
