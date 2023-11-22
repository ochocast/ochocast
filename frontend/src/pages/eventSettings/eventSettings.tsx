import { FC, useState, ChangeEvent, FormEvent, useEffect } from 'react';
import React from 'react';
import './eventSettings.css';
import TextBox from '../../components/TextBox/TextBox';
import TextArea from '../../components/TextArea/TextArea';
import { Option, SelectBox } from '../../components/SelectBox/SelectBox';
import Button from '../../components/buttons/button/button';
import { useNavigate, useParams } from 'react-router-dom';
import DropDownMenuTracks from '../../components/DropDownMenuTracks/DropDownMenuTracks';
import { getEvent, updateEvent } from '../../utils/api';
import trackSelectImage from '../../assets/tracksIconeSelect.png';
import rouageImage from '../../assets/rouage.svg';
import { Track } from '../../utils/EventsProperties';
import Modal from '../../components/modal/modal';

interface EventSettingsProps {}

const EventSettings: FC<EventSettingsProps> = () => {
  const { eventId } = useParams();

  const [isButtonDisabled, setButtonDisabled] = useState(true);
  const [eventClosed, setEventClosed] = useState(false);

  const [isOpen, setisOpen] = useState(false);
  const toggle = () => {
    setisOpen(!isOpen);
  };

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
  const [modalMessage, setModalMessage] = useState('');

  const navigate = useNavigate();

  const [tracks, setTracks] = useState<Track[]>([]);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await getEvent(eventId);
        if (res.status === 200) {
          if (res.data[0].closed) setEventClosed(true);
          setTracks(res.data[0].tracks);
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

  const closeEvent = async () => {
    for (const track of tracks) {
      if (track.closed === false) {
        setModalMessage(
          "Impossible de clôturer l'évènement, il faut clôturer les pistes avant de clôturer l'évènement",
        );
        return;
      }
    }
    try {
      const res = await updateEvent(eventId, { closed: true });
      if (res.status == 200) {
        setEventClosed(true);
        toggle();
        setMessage("L'évènement a bien été clôturé");
      }
    } catch (error) {
      setMessage("L'évènement n'a pas pu être clôturé");
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
          isButtonDisplayed={!eventClosed}
          imageUrl={trackSelectImage}
        />
      </div>
      <form onSubmit={handleSubmit} className="event-settings">
        <div className="title-layout">
          <h1>Modifier l&apos;évènement</h1>
          {eventClosed ? (
            <h2>L&apos;évènement est clôturé</h2>
          ) : (
            <Button className="close-event" type="button" onClick={toggle}>
              Clôturer l&apos;évènement
            </Button>
          )}
        </div>
        <Modal isOpen={isOpen} toggle={toggle}>
          <h2> Etes-vous sur de vouloir clôturer l&apos;évènement ?</h2>
          <div className="confirmation-buttons">
            <Button type="button" onClick={closeEvent}>
              Confirmer
            </Button>
            <Button
              bcolor="#D9D9D9"
              onClick={() => {
                toggle();
                setModalMessage('');
              }}
            >
              Annuler
            </Button>
          </div>
          <div className="message">
            {modalMessage ? <p>{modalMessage}</p> : null}
          </div>
        </Modal>
        <TextBox
          type="text"
          label="Nom"
          placeholder="Nom de l'évènement"
          name={name}
          value={name}
          error={errorName}
          disabled={eventClosed}
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
            disabled={eventClosed}
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
            disabled={eventClosed}
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
            disabled={eventClosed}
            required
          />
        </div>
        <SelectBox
          title="Catégorie"
          options={options}
          value={categoryValue}
          onChange={handleSelectChange}
          disabled={eventClosed}
          required={true}
        />
        <TextArea
          label="Description"
          placeholder="Description de l'évenement"
          value={description}
          name="description"
          error={errorDescription}
          disabled={eventClosed}
          onChange={handleDescriptionChange}
        />
        {!eventClosed && (
          <Button
            className="submit-button"
            type="submit"
            disabled={isButtonDisabled}
          >
            Sauvergarder
          </Button>
        )}
        <div className="message">{message ? <p>{message}</p> : null}</div>
      </form>
    </div>
  );
};

export default EventSettings;
