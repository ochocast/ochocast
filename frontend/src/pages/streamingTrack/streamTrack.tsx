import React, { useEffect, useState } from 'react';
import './streamTrack.css';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrackById, getPublicEvent, closeTrack } from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import Button from '../../components/ReworkComponents/generic/Button/Button';
import LiveStream from '../../components/livestream/livestream';

const fetchTrack = async (trackId?: string) => {
  try {
    const res = await getTrackById(trackId);
    const track = await res.data;
    return track;
  } catch (error) {
    console.error(`Failed to fetch tracks: ${error}`);
  }
};

const fetchEvent = async (eventId?: string) => {
  try {
    const res = await getPublicEvent(eventId);
    return await res.data;
  } catch (error) {
    console.error(`Failed to fetch event: ${error}`);
  }
};

const StreamTrack = () => {
  const { trackId } = useParams();
  const [track, setTrack] = useState<Track>();
  const navigate = useNavigate();

  if (track?.closed) {
    navigate(`/events/${track?.event.id}/tracks`);
  }

  const fetchCloseTrack = () => {
    return () => {
      closeTrack(trackId).then(() => {
        navigate(`/events/${track?.event.id}/tracks`);
      });
    };
  };

  useEffect(() => {
    const fetchTrackData = async () => {
      const track = await fetchTrack(trackId);
      if (!track) {
        console.error('Error while fetching track');
        return;
      }
      track.event = fetchEvent(track.eventId);
      setTrack(track);
    };
    fetchTrackData();
  }, [trackId]);

  return (
    <div className="live-page">
      {track ? (
        <>
          <div className="live-header">
            <h1 className="event-title">{track.event?.name}</h1>
            <Button label="Clôturer la piste" onClick={fetchCloseTrack()} />
          </div>

          <div className="live-container">
            <LiveStream streamKey={track.streamKey} />
          </div>

          <div className="track-info">
            <div className="track-title">
              <h2>{track.name}</h2>
              <Button
                label="Paramètres"
                onClick={() =>
                  navigate(
                    `/events/${track.event.id}/track-settings/${trackId}`,
                  )
                }
              />
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
