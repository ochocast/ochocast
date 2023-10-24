import React, { FC } from 'react';
import './DropDownMenuTracks.css';
import Track from '../../utils/EventsProperties';
import addButton from '../../assets/addButton.png';
import { useNavigate } from 'react-router-dom';

interface DropDownMenuTracksProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tracks?: Track[];
  eventId?: number;
  imageUrl?: string;
  isButtonDisplayed?: boolean;
}

const DropDownMenuTracks: FC<DropDownMenuTracksProps> = ({
  tracks = [],
  eventId,
  imageUrl,
  isButtonDisplayed = false,
}) => {
  const navigate = useNavigate();
  return (
    <div className="DropDownMenu">
      <img className="image-list-menu" src={imageUrl} alt="iconeSelect" />
      <div className="dropdown">
        <button className="dropbtn">Pistes</button>
        <div className="dropdown-content">
          {tracks.map((track: Track, index: number) => (
            <a
              key={index}
              onClick={() =>
                navigate(`/events/${eventId}/track-settings/${track.id}`)
              }
            >
              {track.name}
            </a>
          ))}
        </div>
      </div>
      {isButtonDisplayed && (
        <button
          className="add-track-button-navbar"
          type="button"
          onClick={() => navigate(`/events/${eventId}/track-settings`)}
        >
          <img className="image-add-track" src={addButton} alt="buttonpng" />
        </button>
      )}
    </div>
  );
};

export default DropDownMenuTracks;
