import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';

import './TrackBox.css';
import { Track } from '../../utils/EventsProperties';

interface trackBoxProps {
  track: Track;
}

const TrackBox: FC<trackBoxProps> = ({ track }) => {
  track.speakers = ['Speaker 1', 'Speaker 2']; // FIXME : delete when speakers will be implemented in back

  const navigate = useNavigate();
  const handleOnClickTrackButton = () => {
    navigate(`/tracks/${track.id}`);
  };

  return (
    <div className="track_box">
      <div className="button_title_wrapper">
        <span className="track_title">{track.name}</span>
        <button className="track_button" onClick={handleOnClickTrackButton}>
          Regarder la piste
        </button>
      </div>
      <div className="line" />
      <div className="track_content">
        Orateurs :{' '}
        {track.speakers && track.speakers.length
          ? track.speakers.map((speaker, index) =>
              index === track.speakers.length - 1 ? (
                <>{speaker}</>
              ) : (
                <>{speaker}, </>
              ),
            )
          : null}
      </div>
      <div className="track_content">{track.description}</div>
    </div>
  );
};

export default TrackBox;
