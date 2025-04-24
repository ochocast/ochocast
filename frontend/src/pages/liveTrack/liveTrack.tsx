import React, { useEffect, useState } from 'react';
import './liveTrack.css';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrackById, updateTrack } from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import Button from '../../components/ReworkComponents/generic/Button/Button';
import { default as _ReactPlayer } from 'react-player/lazy';
import { ReactPlayerProps } from 'react-player/types/lib';
import NavigateBackButton from '../../components/buttons/NavigateBackButton/NavigateBackButton';
// import WaitingScreen from '../../components/waitingScreen/waitingScreen';

const ReactPlayer = _ReactPlayer as unknown as React.FC<ReactPlayerProps>;

const LiveTrack = () => {
  const { trackId } = useParams();
  const [track, setTrack] = useState<Track>();
  const [url, setUrl] = useState<string>();
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

  const changeQuality = (quality: string) => {
    setUrl(url?.split('.m3u8')[0].split('_')[0] + quality + '.m3u8');
  };

  useEffect(() => {
    try {
      getTrackById(trackId).then((res) => {
        setTrack(res);
        setUrl(
          `${process.env.REACT_APP_STREAM_URL}/hls/${res?.streamKey}.m3u8`,
        );
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
            <div className="live-header-left">
              <NavigateBackButton />
              <h1 className="event-title">{track.event.name}</h1>
            </div>
            <Button
              label='Clôturer la piste'
              onClick={closeTrack()}
            />
          </div>
          <div className="player-wrapper">
          {/* {url ? ( */}
            <div>
              <ReactPlayer
                width="100%"
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
          {/* ) : ( */}
            {/* <WaitingScreen /> */}
           {/* )} */}
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
                label='Paramètres'
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

export default LiveTrack;
