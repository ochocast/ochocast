import React, { FC } from 'react';

import './TrackBox.css';

interface trackBoxProps {
  title: string;
  speakers: string[];
  description: string;
}

const TrackBox: FC<trackBoxProps> = ({ title, speakers, description }) => {
  const handleOnClickTrackButton = () => {
    // FIX ME : go to streaming page
    console.log('Button clicked !');
  };

  return (
    <div className="track_box">
      <div className="button_title_wrapper">
        <span className="track_title">{title}</span>
        <button className="track_button" onClick={handleOnClickTrackButton}>
          Regarder la piste
        </button>
      </div>
      <div className="line" />
      <div className="track_content">
        Orateurs :{' '}
        {speakers && speakers.length
          ? speakers.map((speaker, index) =>
              index === speakers.length - 1 ? <>{speaker}</> : <>{speaker}, </>,
            )
          : null}
      </div>
      <div className="track_content">{description}</div>
    </div>
  );
};

export default TrackBox;
