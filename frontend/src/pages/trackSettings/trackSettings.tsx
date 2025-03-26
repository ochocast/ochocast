import { FC, useState, ChangeEvent, FormEvent, useEffect } from 'react';
import React from 'react';
import TextBox from '../../components/TextBox/TextBox';
import TextArea from '../../components/TextArea/TextArea';
import './trackSettings.css';
import Button from '../../components/buttons/button/button';
import { useNavigate, useParams } from 'react-router-dom';
import DropDownMenuTracks from '../../components/ReworkComponents/Event/Track/DropDownMenuTracks/DropDownMenuTracks';
import { CheckBoxList } from '../../components/checkBoxList/CheckBoxList';
import {
  createTrack,
  getTrackById,
  updateTrack,
  getEvent,
  getUsers,
  deleteTrack,
} from '../../utils/api';
import trackSelectImage from '../../assets/tracksIconeSelect.png';
import rouageImage from '../../assets/rouage.svg';
import { Track, User } from '../../utils/EventsProperties';
import Modal from '../../components/modal/modal';
import NavigateBackButton from '../../components/buttons/NavigateBackButton/NavigateBackButton';
import logger from '../../utils/logger';

interface TrackSettingsProps {}

const TrackSettings: FC<TrackSettingsProps> = () => {
  const { eventId, trackId } = useParams();

  const [isButtonDisabled, setButtonDisabled] = useState(true);

  //Handle permissions for a track
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [speakers, setSpeakers] = useState<User[]>([]);
  const [moderators, setModerators] = useState<User[]>([]);
  const [eventClosed, setEventClosed] = useState(false);

  //Get all users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await getUsers();
        if (res.status === 200) {
          setAllUsers(res.data);
        }
      } catch (error) {
        logger.error(`Failed to fetch users: ${error}`);
      }
    };
    fetchUsers();
  }, []);

  const [name, setName] = useState('');
  const [errorName, setErrorName] = useState(false);
  const handleNameChange = (e: ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    setButtonDisabled(false);
  };

  const [description, setDescription] = useState('');
  const [errorDescription, setErrorDescription] = useState(false);
  const handleDescriptionChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setDescription(e.target.value);
    setButtonDisabled(false);
  };

  const [modalMessage, setModalMessage] = useState('');
  const [closed, setClosed] = useState(false);
  const [keywords, setKeyWords] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [isOpen, setisOpen] = useState(false);

  const toggle = () => {
    setisOpen(!isOpen);
  };
  const [isDeleteModalOpen, setisDeleteModalOpen] = useState(false);
  const toggleDeleteModal = () => {
    setisDeleteModalOpen(!isDeleteModalOpen);
  };

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        const res = await getEvent(eventId);
        if (res.status === 200) {
          if (res.data[0].closed) setEventClosed(true);
          setTracks(res.data[0].tracks);
        }
      } catch (error) {
        logger.error(`Failed to fetch tracks: ${error}`);
      }
    };
    fetchTracks();
  }, [eventId]);

  useEffect(() => {
    if (trackId) {
      const fetchOneTrack = async () => {
        try {
          const trck = await getTrackById(trackId);
          setDescription(trck.description);
          setName(trck.name);
          setClosed(trck.closed);
          setKeyWords(trck.keywords);
          //setSpeakers(trck.speakers);
          //setModerators(trck.moderators);
        } catch (error) {
          logger.error(
            `Failed to fetch track from track id ${trackId}: ${error}`,
          );
        }
      };
      fetchOneTrack();
    } else {
      setDescription('');
      setName('');
      setClosed(false);
      //setSpeakers([]);
      //setModerators([]);
    }
  }, [trackId]);

  const handleDelete = async () => {
    if (trackId) {
      try {
        const res = await deleteTrack(trackId);
        if (res.status === 200) {
          tracks.splice(tracks.findIndex((track) => track.id === trackId));
          const url = '/events/' + eventId + '/event-settings';
          navigate(url);
        }
      } catch (error) {
        logger.error(error);
        setMessage(
          "La piste n'a pas pu être supprimée, une erreur est survenue",
        );
      }
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    let error = false;
    if (!name.trim()) {
      setErrorName(true);
      error = true;
      return;
    }
    if (!description.trim()) {
      setErrorDescription(true);
      error = true;
      return;
    }

    if (speakers.length === 0 && moderators.length === 0) {
      setMessage(
        'Vous devez choisir au moins un orateur et un modérateur pour cette piste',
      );
      error = true;
      return;
    }
    if (!error) {
      const trackBody = {
        name: name,
        description: description,
        keywords: keywords,
        closed: false,
        event: eventId,
      };

      if (trackId) {
        try {
          const res = await updateTrack(trackId, trackBody);
          setButtonDisabled(true);
          const trackIndex = tracks.findIndex((track) => track.id === trackId);
          tracks[trackIndex] = res.data;
        } catch (error) {
          logger.error(error);
          setMessage(
            "La piste n'a pas pu être sauvegardé, une erreur est survenue",
          );
        }
      } else {
        try {
          const res = await createTrack(trackBody);
          if (res.status === 201) {
            setButtonDisabled(true);
            const resJson = await res.data;
            const url = '/events/' + eventId + '/track-settings/' + resJson.id;
            tracks.push(res.data);
            navigate(url);
          }
        } catch (error) {
          logger.error(error);
          setMessage("La piste n'a pas pu être créer, une erreur est survenue");
        }
      }
    }
  };
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
        <DropDownMenuTracks
          tracks={tracks}
          eventId={eventId ?? ""} 
          isButtonDisplayed={!eventClosed}
          isTracksDisplayed={true}
          imageUrl={trackSelectImage}
        />
      </div>
      <form onSubmit={handleSubmit} className="track-settings">
        <div className="top-layout">
          <div className="title-layout">
            <NavigateBackButton />
            <h1>{trackId ? name : 'Nouvelle Piste'}</h1>
          </div>
          {trackId ? (
            <Button
              className="start-live"
              type="button"
              onClick={toggle}
              disabled={closed}
            >
              Commencer le live
            </Button>
          ) : null}
        </div>
        <hr />
        <Modal isOpen={isOpen} toggle={toggle}>
          <h1>Commencer le live</h1>
          <div className="start-live-buttons">
            <Button type="button"> Lancer le live depuis OBS</Button>
            <Button
              className="octocast-start-button"
              type="button"
              onClick={() => navigate('/tracks/' + trackId + '/streaming')}
            >
              Lancer le live depuis OCTOCast
            </Button>
          </div>
        </Modal>
        <TextBox
          type="text"
          label="Nom de la piste"
          placeholder="Ma piste"
          value={name}
          name="name"
          error={errorName}
          disabled={closed}
          onChange={handleNameChange}
        />
        <TextArea
          label="Description de la piste"
          placeholder="Description..."
          value={description}
          name="description"
          error={errorDescription}
          disabled={closed}
          onChange={handleDescriptionChange}
        />
        <div className="checkBoxListContainer">
          <CheckBoxList
            allUsers={allUsers}
            category={speakers}
            setCategory={setSpeakers}
            title="Orateurs"
            disabled={closed}
          />
          <CheckBoxList
            allUsers={allUsers}
            category={moderators}
            setCategory={setModerators}
            title="Moderateurs"
            disabled={closed}
          />
        </div>
        <div className="controlsContainer">
          <Button
            className="submit-button"
            type="submit"
            disabled={isButtonDisabled || closed}
          >
            {trackId ? <div>Sauvegarder</div> : <div>Créer</div>}
          </Button>
          {trackId ? (
            <Button
              className="delete-button"
              type="button"
              onClick={toggleDeleteModal}
            >
              Supprimer la piste
            </Button>
          ) : null}
        </div>
        <Modal isOpen={isDeleteModalOpen} toggle={toggleDeleteModal}>
          <h2> Etes-vous sur de vouloir supprimer l&apos;évènement ?</h2>
          <div className="confirmation-buttons">
            <Button type="button" onClick={handleDelete}>
              Supprimer
            </Button>
            <Button
              tcolor="#0E2356"
              bcolor="#D9D9D9"
              onClick={() => {
                toggleDeleteModal();
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
        <div className="message">{message ? <p>{message}</p> : null}</div>
      </form>
    </div>
  );
};

export default TrackSettings;
