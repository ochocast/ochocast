import React, { useState } from 'react';
import './DropDownMenuTracks.css';
import { Track } from '../../../../../utils/EventsProperties';
import addButton from '../../../../../assets/addButton.png';
import ArrowButton from '../../../../../assets/gaucheAigu.svg';

import { useNavigate } from 'react-router-dom';

export interface DropDownMenuTracksProps {
  tracks: Track[];
  eventId: string;
  imageUrl: string;
  isButtonDisplayed: boolean;
  isTracksDisplayed: boolean;
}

const DropDownMenuTracks = (props: DropDownMenuTracksProps) => {
  const [dropDownButtonState, setDropDownButtonState] = useState(
    props.isTracksDisplayed,
  );
  const navigate = useNavigate();

  const addTrackButton = (
    <button
      className="add-track-button-navbar"
      type="button"
      onClick={() => navigate(`/events/${props.eventId}/track-settings`)}
    >
      <img className="image-button-track" src={addButton} alt="buttonpng" />
    </button>
  );

  const showTrackButton = (
    <button
      className="show-track-button-navbar"
      type="button"
      onClick={() => setDropDownButtonState(!dropDownButtonState)}
    >
      <img
        className="image-button-track"
        src={ArrowButton}
        alt="arrow-button"
        style={{
          transform: `rotate(${dropDownButtonState ? 90 : -90}deg)`,
        }}
      />
    </button>
  );

  const header = (
    <div className="DropDownMenuHeader">
      <img className="image-list-menu" src={props.imageUrl} alt="iconeSelect" />
      <button className="dropbtn">Pistes</button>
      <div className="track-button-container">
        {props.isButtonDisplayed && addTrackButton}
        {props.tracks.length > 0 && showTrackButton}
      </div>
    </div>
  );

  const body = (
    <div className="button-container">
      {props.tracks.map((track: Track, index: number) => (
        <button
          className="dropbtn track-button"
          key={index}
          onClick={() =>
            navigate(`/events/${props.eventId}/track-settings/${track.id}`)
          }
        >
          {track.name}
        </button>
      ))}
    </div>
  );
  return (
    <div className="DropDownMenu">
      {header}
      {dropDownButtonState && body}
    </div>
  );
};

export default DropDownMenuTracks;
