import React, { useEffect, useState } from 'react';
import './liveTrack.css';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrackById } from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import Button from '../../components/buttons/button/button';
import { default as _ReactPlayer } from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
const ReactPlayer = _ReactPlayer as unknown as React.FC<ReactPlayerProps>;

const LiveTrack = () => {
  const { trackId } = useParams();
  const [track, setTrack] = useState<Track>();
  const [url, setUrl] = useState<string>();
  const navigate = useNavigate();

  const changeQuality = (quality: string) => {
    setUrl(url?.split('.m3u8')[0].split('_')[0] + quality + '.m3u8');
  };

  const fetchTrack = async () => {
    try {
      const res = await getTrackById(trackId);
      setTrack(res);
      setUrl(`${process.env.REACT_APP_STREAM_URL}/hls/${res?.streamKey}.m3u8`);
    } catch (error) {
      console.error(`Failed to fetch tracks: ${error}`);
    }
  };

  useEffect(() => {
    fetchTrack();
  }, [trackId]);
  return (
    <div className="live-page">
      {track ? (
        <>
          <h1>{track.event.name}</h1>
          <div>
            <ReactPlayer
              width="55%"
              height="auto"
              url={url}
              playing
              controls
              config={{
                file: {
                  forceHLS: true,
                  hlsOptions: {
                    liveSyncDurationCount: 2,
                    liveMaxLatencyDurationCount: 3,
                  },
                },
              }}
            />
          </div>
          <div>
            <button onClick={() => changeQuality('_low')}>Low</button>
            <button onClick={() => changeQuality('_mid')}>Medium</button>
            <button onClick={() => changeQuality('_high')}>High</button>
            <button onClick={() => changeQuality('_hd720')}>HD</button>
            <button onClick={() => changeQuality('_src')}>Source</button>
            <button onClick={() => changeQuality('')}>Auto</button>
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

export default LiveTrack;
