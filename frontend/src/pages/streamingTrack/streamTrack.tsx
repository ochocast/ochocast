import React, { useEffect, useState } from 'react';
import './streamTrack.css';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrackById, updateTrack } from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import Button from '../../components/buttons/button/button';
import LiveStream  from '../../components/livestream/livestream';

const StreamTrack = () => {
  const { trackId } = useParams();
  const [track, setTrack] = useState<Track>();
  const navigate = useNavigate();

  if (track?.closed) {
    navigate(`/events/${track?.event.id}/tracks`);
  }

  const closeTrack = () => {
    return () => {
      updateTrack(trackId, { closed: true }).then(() => {
        navigate(`/events/${track?.event.id}/tracks`);
      });
    };
  };

  useEffect(() => {
    try {
      getTrackById(trackId).then((res) => {
        setTrack(res);
      });
    } catch (error) {
      console.error(`Failed to fetch tracks: ${error}`);
    }
  }, [trackId]);

  return (
    <div className="live-page">
      {track ? (
        <>
          <div className="live-header">
            <h1 className="event-title">{track.event.name}</h1>
            <Button
              height="40px"
              className="close-button"
              onClick={closeTrack()}
            >
              Clôturer la piste
            </Button>
          </div>

          <div className="live-container">
            <LiveStream streamKey={track.streamKey} />
          </div>
         
          <div className="track-info">
            <div className="track-title">
              <h2>{track.name}</h2>
              <Button
                type="button"
                className="param-button"
                onClick={() =>
                  navigate(
                    `/events/${track.event.id}/track-settings/${trackId}`,
                  )
                }
              >
                Paramètres
              </Button>
            </div>
            <div className="description">{track.description}</div>
          </div>
        </>
      ) : (
        <h1>loading</h1>
      )}
    </div>
  );
};

export default StreamTrack;
