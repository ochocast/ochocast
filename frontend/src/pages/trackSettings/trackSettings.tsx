import React from 'react';
import { FC, ChangeEvent, useState } from 'react';
import TextArea from '../../components/ReworkComponents/generic/Text/TextArea/TextArea';
import TextBox from '../../components/ReworkComponents/generic/Text/TextBox/TextBox';
import './trackSettings.css';
import Button, {
  ButtonType,
} from '../../components/ReworkComponents/generic/Button/Button';
import { useParams } from 'react-router-dom';
import CheckBoxList from '../../components/ReworkComponents/Event/Track/CheckBoxList/CheckBoxList';
import DropDownMenuTracks from '../../components/ReworkComponents/Event/Track/MenuTracks/MenuTracks';
import NavigateBackButton from '../../components/buttons/NavigateBackButton/NavigateBackButton';
import Modal from '../../components/modal/modal';

import trackSelectImage from '../../assets/tracksIconeSelect.png';
import rouageImage from '../../assets/rouage.svg';

import { useTrackSettings } from './useTrackSettings';
import { User } from '../../utils/EventsProperties';
import { formatDateForInput, formatTimeForInput } from '../../utils/formatDate';

const TrackSettings: FC = () => {
  const { trackId, eventId } = useParams();
  const {
    allUsers,
    event,
    tracks,
    track,
    setTrack,
    speakers,
    setSpeakers,
    message,
    setMessage,
    handleSubmit,
    handleDelete,
    // loading,
    navigate,
  } = useTrackSettings();

  const [isButtonDisabled, setButtonDisabled] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  if (trackId && !track) {
    return <div className="loading">Chargement de la piste...</div>;
  }

  const userString = localStorage.getItem('backendUser');
  const userId = userString ? JSON.parse(userString).id : '';
  const canEdit =
    event?.creatorId === userId || track.speakers?.some((e) => e.id === userId);

  const toggle = () => setIsOpen(!isOpen);
  const toggleDeleteModal = () => setIsDeleteModalOpen(!isDeleteModalOpen);

  const handleInputChange =
    (field: keyof typeof track) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setTrack({ ...track, [field]: e.target.value });
      setButtonDisabled(false);
      setMessage('');
    };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    handleSubmit(e, track, speakers);
  };

  const closed = track.closed || event?.closed;

  const form = (
    <form onSubmit={handleFormSubmit} className="track-settings">
      <div className="top-layout">
        <div className="title-layout">
          <NavigateBackButton />
          <h1>{trackId ? track.name : 'Nouvelle Piste'}</h1>
        </div>
        {trackId && (
          <Button
            label="Commencer le live"
            onClick={toggle}
            type={closed ? ButtonType.disabled : ButtonType.secondary}
          />
        )}
      </div>
      <hr />
      <Modal isOpen={isOpen} toggle={toggle}>
        <h1>Commencer le live</h1>
        <div className="start-live-buttons">
          <Button label="Lancer le live depuis OBS" />
          <Button
            label="Lancer le live depuis OCHOCast"
            onClick={() => navigate(`/tracks/${trackId}/streaming`)}
          />
        </div>
      </Modal>

      <TextBox
        type="text"
        label="Nom de la piste"
        placeholder="Ma piste"
        value={track.name || ''}
        name="name"
        error={!track.name}
        disabled={closed}
        onChange={handleInputChange('name')}
      />
      <TextArea
        label="Description de la piste"
        placeholder="Description..."
        value={track.description || ''}
        name="description"
        error={!track.description}
        disabled={closed}
        onChange={handleInputChange('description')}
      />

      <div className="track-date-speaker-wrapper">
        <div className="checkBoxListContainer">
          <CheckBoxList
            allUsers={allUsers}
            category={speakers}
            setCategory={(users: User[]) => {
              setSpeakers(users);
              setButtonDisabled(false);
            }}
            title="Orateurs"
            disabled={closed !== undefined && closed}
          />
          <div className="track-date-inputs">
            <div className="input-wrapper">
              <label>Date de l&apos;évènement</label>
              <input
                type="date"
                name="date"
                value={formatDateForInput(track.startDate)}
                disabled
                required
              />
            </div>
            <div className="input-wrapper">
              <label>Début de la piste</label>
              <input
                type="time"
                name="start"
                value={formatTimeForInput(track.startDate)}
                onChange={(e) => {
                  const [hours, minutes] = e.target.value
                    .split(':')
                    .map(Number);
                  const current = new Date(track.startDate || new Date());
                  current.setHours(hours);
                  current.setMinutes(minutes);
                  current.setSeconds(0);
                  current.setMilliseconds(0);
                  setTrack({ ...track, startDate: current });
                  setButtonDisabled(false);
                  setMessage('');
                }}
                disabled={closed}
                required
              />
            </div>
            <div className="input-wrapper">
              <label>Fin de la piste</label>
              <input
                type="time"
                name="end"
                value={formatTimeForInput(track.endDate)}
                onChange={(e) => {
                  const [hours, minutes] = e.target.value
                    .split(':')
                    .map(Number);
                  const current = new Date(track.endDate || new Date());
                  current.setHours(hours);
                  current.setMinutes(minutes);
                  current.setSeconds(0);
                  current.setMilliseconds(0);
                  setTrack({ ...track, endDate: current });
                  setButtonDisabled(false);
                  setMessage('');
                }}
                disabled={closed}
                required
              />
            </div>
          </div>
        </div>
      </div>

      <div className="controlsContainer">
        <Button
          label={trackId ? 'Sauvegarder' : 'Créer'}
          type={
            isButtonDisabled || closed
              ? ButtonType.disabled
              : ButtonType.secondary
          }
        />
        {trackId && (
          <Button label="Supprimer la piste" onClick={toggleDeleteModal} />
        )}
      </div>

      <Modal isOpen={isDeleteModalOpen} toggle={toggleDeleteModal}>
        <h2>Êtes-vous sûr de vouloir supprimer la piste ?</h2>
        <div className="confirmation-buttons">
          <Button label="Supprimer" onClick={handleDelete} />
          <Button
            label="Annuler"
            onClick={() => {
              toggleDeleteModal();
              setMessage('');
            }}
          />
        </div>
      </Modal>
      <div className="message">{message && <p>{message}</p>}</div>
    </form>
  );

  const trackInfo = (
    <div className="track-settings">
      <div className="top-layout">
        <div className="title-layout">
          <NavigateBackButton />
          <h1>{trackId ? track.name : 'Ereur'}</h1>
        </div>
      </div>
      <hr />
      <TextBox
        type="text"
        label="Nom de la piste"
        placeholder="Ma piste"
        value={track.name || ''}
        name="name"
        error={!track.name}
        disabled={true}
        onChange={handleInputChange('name')}
      />
      <TextArea
        label="Description de la piste"
        placeholder="Description..."
        value={track.description || ''}
        name="description"
        error={!track.description}
        disabled={true}
        onChange={handleInputChange('description')}
      />

      <div className="track-date-speaker-wrapper">
        <div className="checkBoxListContainer">
          <CheckBoxList
            allUsers={allUsers}
            category={speakers}
            setCategory={(users: User[]) => {
              setSpeakers(users);
              setButtonDisabled(false);
            }}
            title="Orateurs"
            disabled={true}
          />
          <div className="track-date-inputs">
            <div className="input-wrapper">
              <label>Date de l&apos;évènement</label>
              <input
                type="date"
                name="date"
                value={formatDateForInput(track.startDate)}
                disabled={true}
                required
              />
            </div>
            <div className="input-wrapper">
              <label>Début de la piste</label>
              <input
                type="time"
                name="start"
                value={formatTimeForInput(track.startDate)}
                disabled={true}
                required
              />
            </div>
            <div className="input-wrapper">
              <label>Fin de la piste</label>
              <input
                type="time"
                name="end"
                value={formatTimeForInput(track.endDate)}
                disabled={true}
                required
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page-track-settings">
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
          isButtonDisplayed={!closed && userId === event?.creatorId}
          imageUrl={trackSelectImage}
        />
      </div>
      {canEdit ? form : trackInfo}
    </div>
  );
};

export default TrackSettings;
