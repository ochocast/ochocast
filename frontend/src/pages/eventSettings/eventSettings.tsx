import { FC, useState, ChangeEvent, FormEvent, useEffect } from 'react';
import React from 'react';
import './eventSettings.css';
import TextArea from '../../components/ReworkComponents/generic/Text/TextArea/TextArea';
import TextBox from '../../components/ReworkComponents/generic/Text/TextBox/TextBox';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import { useNavigate, useParams } from 'react-router-dom';
import DropDownMenuTracks from '../../components/ReworkComponents/Event/Track/MenuTracks/MenuTracks';
import {
  getPrivateEvent,
  updateEvent,
  deleteEvent,
  closeEvent,
} from '../../utils/api';
import trackSelectImage from '../../assets/tracksIconeSelect.png';
import rouageImage from '../../assets/rouage.svg';
import { Track } from '../../utils/EventsProperties';
import Modal from '../../components/modal/modal';
import NavigateBackButton from '../../components/buttons/NavigateBackButton/NavigateBackButton';
import logger from '../../utils/logger';
import { useTranslation } from 'react-i18next';

interface EventSettingsProps {}

const EventSettings: FC<EventSettingsProps> = () => {
  const { t } = useTranslation();
  const { eventId } = useParams();

  const [isButtonDisabled, setButtonDisabled] = useState(true);
  const [eventClosed, setEventClosed] = useState(false);

  const [isDeleteOpen, setisDeleteOpen] = useState(false);
  const toggleDeleteModal = () => {
    setisDeleteOpen(false);
  };

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

  const [message, setMessage] = useState('');
  const [modalMessage, setModalMessage] = useState('');

  const navigate = useNavigate();

  const [tracks, setTracks] = useState<Track[]>([]);

  const [isFetchError, setIsFetchError] = useState(false);

  const [creatorId, setCreatorId] = useState('');
  const userString = localStorage.getItem('backendUser');
  const userId = userString ? JSON.parse(userString).id : '';

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await getPrivateEvent(eventId);
        if (res.status === 200) {
          if (res.data.closed) setEventClosed(true);
          setTracks(res.data.tracks);
          setName(res.data.name);
          setDescription(res.data.description);
          setDate(res.data.startDate.split('T')[0]);
          setStartHour(res.data.startDate.match(/\d{2}:\d{2}/)?.[0] || '');
          setEndHour(res.data.endDate.match(/\d{2}:\d{2}/)?.[0] || '');
          setCreatorId(res.data.creator.id);
        }
      } catch (error) {
        logger.error(`Failed to fetch event: ${error}`);
        setIsFetchError(true);
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
          tags: [],
          startDate: date + 'T' + startHour + ':00.000Z',
          endDate: date + 'T' + endHour + ':00.000Z',
          isPrivate: true,
        });

        if (res.status === 200) {
          setMessage(t('eventModified'));
          setButtonDisabled(true);
        }
      } catch (error) {
        logger.error(error);
        setMessage(t('eventCouldNotBeModified'));
      }
    }
  };

  const deleteEventHandler = async () => {
    try {
      await deleteEvent(eventId);
      navigate('/events/');
    } catch (error) {
      setMessage(t('eventCouldNotBeDeleted'));
    }
  };

  const handleCloseEvent = async () => {
    for (const track of tracks) {
      if (track.closed === false) {
        setModalMessage(t('impossibleCloseEvent'));
        return;
      }
    }
    try {
      const res = await closeEvent(eventId);
      if (res.status == 200) {
        setEventClosed(true);
        toggle();
        setMessage(t('eventClosed'));
      }
    } catch (error) {
      setMessage(t('eventCouldNotClosed'));
    }
  };

  if (isFetchError)
    return (
      <Button
        label={t('eventUnavailableReturnPresentationPage')}
        onClick={() => navigate('/events')}
      />
    );

  const forms = (
    <form onSubmit={handleSubmit} className="event-settings">
      <div className="top-layout">
        <div className="title-layout">
          <NavigateBackButton />
          <h1>Modifier l&apos;évènement</h1>
        </div>
        {eventClosed ? (
          <h2>L&apos;évènement est clôturé</h2>
        ) : (
          <Button label="Clôturer l'évènement" onClick={toggle} />
        )}
      </div>
      <Modal isOpen={isOpen} toggle={toggle}>
        <h2> Etes-vous sur de vouloir clôturer l&apos;évènement ?</h2>
        <div className="confirmation-buttons">
          <Button label="Confirmer" onClick={handleCloseEvent} />
          <Button
            label="Annuler"
            onClick={() => {
              toggle();
              setModalMessage('');
            }}
          />
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
        <div className="confirmation-buttons">
          <Button
            label="Supprimer l'évènement"
            onClick={() => setisDeleteOpen(true)}
          />
          <Button
            label="Sauvegarder"
            type={isButtonDisabled ? ButtonType.disabled : ButtonType.secondary}
          />
        </div>
      )}
      <Modal isOpen={isDeleteOpen} toggle={toggleDeleteModal}>
        <h2> Etes-vous sur de vouloir supprimer l&apos;évènement ?</h2>
        <div className="confirmation-buttons">
          <Button label="Supprimer" onClick={deleteEventHandler} />
          <Button
            label="Annuler"
            onClick={() => {
              toggleDeleteModal();
              setModalMessage('');
            }}
          />
        </div>
        <div className="message">
          {modalMessage ? <p>{modalMessage}</p> : null}
        </div>
      </Modal>
      <div className="message">{message ? <p>{message}</p> : null}</div>
    </form>
  );

  const dataInfo = (
    <div className="event-settings">
      <div className="top-layout">
        <div className="title-layout">
          <NavigateBackButton />
          <h1>Modifier l&apos;évènement</h1>
        </div>
        {eventClosed && <h2>L&apos;évènement est clôturé</h2>}
      </div>
      <TextBox
        type="text"
        label="Nom"
        placeholder="Nom de l'évènement"
        name={name}
        value={name}
        error={errorName}
        disabled={true}
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
          disabled={true}
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
          disabled={true}
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
          disabled={true}
          required
        />
      </div>
      <TextArea
        label="Description"
        placeholder="Description de l'évenement"
        value={description}
        name="description"
        error={errorDescription}
        disabled={true}
        onChange={handleDescriptionChange}
      />
    </div>
  );

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
        <div className="settings-img-button">
          <img className="image-settings" src={rouageImage} alt="iconeSelect" />
          <button
            className="button-settings"
            type="button"
            onClick={() => navigate(`/events/${eventId}/event-statistics`)}
          >
            Statistiques
          </button>
        </div>
        <DropDownMenuTracks
          tracks={tracks}
          eventId={eventId ?? ''}
          isButtonDisplayed={!eventClosed && userId === creatorId}
          imageUrl={trackSelectImage}
        />
      </div>
      {userId === creatorId ? forms : dataInfo}
    </div>
  );
};

export default EventSettings;
