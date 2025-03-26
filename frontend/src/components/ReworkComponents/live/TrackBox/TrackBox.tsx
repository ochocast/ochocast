import React from 'react';
import { useNavigate } from 'react-router-dom';

import './TrackBox.css';

import { Track } from '../../../../utils/EventsProperties';
import Button, { ButtonType } from '../../generic/Button/Button';

interface TrackBoxProps {
  key: number;
  track: Track;
}

const TrackBox = (props: TrackBoxProps) => {
  props.track.speakers = ['Speaker 1', 'Speaker 2']; // FIXME : delete when speakers will be implemented in back
  const { name, closed, id, speakers, description } = props.track;
  const navigate = useNavigate();

  return (
    <div className="track_box">
      <div className="button_title_wrapper">
        <span className="track_title">{name}</span>
        <Button
          label={closed ? 'Piste fermée' : 'Regarder la piste'}
          type={closed ? ButtonType.disabled : ButtonType.secondary}
          onClick={() => navigate(`/tracks/${id}`)}
        />
      </div>
      <div className="line" />
      <div className="track_content">Orateurs : {speakers.join(', ')}</div>
      <div className="track_content">{description}</div>
    </div>
  );
};

export default TrackBox;
