import { FC, useState, ChangeEvent, FormEvent, useEffect } from 'react';
import React from 'react';
import TextBox from '../../components/TextBox/TextBox';
import TextArea from '../../components/TextArea/TextArea';
import './trackSettings.css';
import Button from '../../components/buttons/button/button';
import { useNavigate, useParams } from 'react-router-dom';
import DropDownMenuTracks from '../../components/DropDownMenuTracks/DropDownMenuTracks';
import { createTrack, getTracks } from '../../utils/api';
import trackSelectImage from '../../assets/tracksIconeSelect.png';
import rouageImage from '../../assets/rouage.svg';
import { Track } from '../../utils/EventsProperties';

interface TrackSettingsProps {
  isNew: boolean;
}

const fetchTracks = async () => {
  try {
    const res = await getTracks();
    return await res.data;
  } catch (error) {
    console.error(`Failed to fetch tracks: ${error}`);
  }
};

const TrackSettings: FC<TrackSettingsProps> = ({ isNew }) => {
  const { eventId } = useParams();

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

  useEffect(() => {
    const fetchTracksData = async () => {
      try {
        const tracks = await fetchTracks();
        setTracks(tracks);
      } catch (error) {
        console.error(`Failed to fetch tracks: ${error}`);
      }
    };
    fetchTracksData();
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorName(true);
    }
    if (!description.trim()) {
      setErrorDescription(true);
    }

    try {
      const res = await createTrack({
        name: name,
        description: description,
        keywords: [],
        streamkey: '',
        closed: false,
        event: eventId,
      });
      if (res.status === 201) {
        setButtonDisabled(true);
        const resJson = await res.data;
        const url = '/events/' + eventId + '/track-settings/' + resJson.id;
        tracks.push(res.data);
        navigate(url);
      }
    } catch (error) {
      console.log(error);
      setMessage("L'évènement n'a pas pu être créer, une erreur est survenue");
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
          <h1>Nouvelle Piste</h1>
        </div>
        <hr />
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
