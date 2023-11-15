import { FC, useState, ChangeEvent, FormEvent, useEffect } from 'react';
import React from 'react';
import TextBox from '../../components/TextBox/TextBox';
import TextArea from '../../components/TextArea/TextArea';
import './trackSettings.css';
import Button from '../../components/buttons/button/button';
import { useNavigate, useParams } from 'react-router-dom';
import DropDownMenuTracks from '../../components/DropDownMenuTracks/DropDownMenuTracks';
import { createTrack, getTrack, updateTrack, getEvent } from '../../utils/api';
import trackSelectImage from '../../assets/tracksIconeSelect.png';
import rouageImage from '../../assets/rouage.svg';
import { Track } from '../../utils/EventsProperties';
import Modal from '../../components/modal/modal';

interface TrackSettingsProps {
  isNew: boolean;
}

const TrackSettings: FC<TrackSettingsProps> = ({ isNew }) => {
  const { eventId, trackId } = useParams();

  const [isButtonDisabled, setButtonDisabled] = useState(true);

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

  const [message, setMessage] = useState('');

  const navigate = useNavigate();

  const [tracks, setTracks] = useState<Track[]>([]);

  const [isOpen, setisOpen] = useState(false);
  const toggle = () => {
    setisOpen(!isOpen);
  };

  useEffect(() => {
    const fetchTracks = async () => {
      try {
        const res = await getEvent(eventId);
        if (res.status === 200) {
          setTracks(res.data[0].tracks);
        }
      } catch (error) {
        console.error(`Failed to fetch tracks: ${error}`);
      }
    };
    fetchTracks();
  }, [eventId]);

  useEffect(() => {
    if (trackId) {
      const fetchOneTrack = async () => {
        try {
          const res = await getTrack(trackId);
          setDescription(res.data[0].description);
          setName(res.data[0].name);
        } catch (error) {
          console.error(
            `Failed to fetch track from track id ${trackId}: ${error}`,
          );
        }
      };
      fetchOneTrack();
    } else {
      setDescription('');
      setName('');
    }
  }, [trackId]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorName(true);
    }
    if (!description.trim()) {
      setErrorDescription(true);
    }

    const trackBody = {
      name: name,
      description: description,
      keywords: [],
      streamkey: '',
      closed: false,
      event: eventId,
    };

    if (trackId) {
      try {
        const res = await updateTrack(trackId, trackBody);
        setButtonDisabled(true);
        const trackIndex = tracks.findIndex(
          (track) => track.id === Number(trackId),
        );
        tracks[trackIndex] = res.data;
      } catch (error) {
        console.log(error);
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
        console.log(error);
        setMessage(
          "La piste n'a pas pu être créer, une erreur est survenue",
        );
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
            onClick={() => navigate(`/events/${eventId}/settings/`)}
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
      <form onSubmit={handleSubmit} className="track-settings">
        <div className="title-layout">
          <h1>{trackId ? name : 'Nouvelle Piste'}</h1>
          {!isNew ? (
            <Button className="start-live" type="button" onClick={toggle}>
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
              onClick={() => navigate('/tracks/' + trackId)}
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
          onChange={handleNameChange}
        />
        <TextArea
          label="Description de la piste"
          placeholder="Description..."
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
          {isNew ? <div>Créer</div> : <div>Sauvegarder</div>}
        </Button>
        <div className="message">{message ? <p>{message}</p> : null}</div>
      </form>
    </div>
  );
};

export default TrackSettings;
