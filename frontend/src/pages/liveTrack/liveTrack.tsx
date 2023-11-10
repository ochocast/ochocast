import React, { useEffect, useState } from 'react';
import './liveTrack.css';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrack } from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import Button from '../../components/buttons/button/button';

const fetchTrack = async (trackId: string) => {
  try {
    const res = await getTrack(trackId);
    return await res.data;
  } catch (error) {
    console.error(`Failed to fetch tracks: ${error}`);
  }
};

const LiveTrack = () => {
  const { trackId } = useParams();
  const [track, setTrack] = useState<Track>();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTracksData = async () => {
      try {
        const trackFetch = await fetchTrack(trackId!);
        setTrack(trackFetch[0]);
      } catch (error) {
        console.error(`Failed to fetch tracks: ${error}`);
      }
    };
    fetchTracksData();
  }, [trackId]);
  return (
    <div className="live-page">
      {track ? (
        <>
          <h1>{track.event.name}</h1>
          <div className="track-info">
            <div className="live-box"></div>
            <div className="track-title">
              <h2>{track.name}</h2>
              <Button
                type="button"
                className="param-button"
                onClick={() =>
                  navigate(
                    '/events/' + track.event.id + '/track-settings/' + trackId,
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

export default LiveTrack;
