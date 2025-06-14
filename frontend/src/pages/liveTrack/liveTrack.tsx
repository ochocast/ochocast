import React, { useEffect, useState } from 'react';
import styles from './liveTrack.module.css';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrackById, getPublicEvent, closeTrack } from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import Button from '../../components/ReworkComponents/generic/Button/Button';
// import { default as _ReactPlayer } from 'react-player/lazy';
// import { ReactPlayerProps } from 'react-player/types/lib';
import NavigateBackButton from '../../components/buttons/NavigateBackButton/NavigateBackButton';
import WaitingScreen from '../../components/waitingScreen/waitingScreen';
import { useTranslation } from 'react-i18next';

// const ReactPlayer = _ReactPlayer as unknown as React.FC<ReactPlayerProps>;

const fetchTrack = async (trackId?: string) => {
  try {
    const res = await getTrackById(trackId);
    return await res.data;
  } catch (error) {
    console.error(`Failed to fetch tracks: ${error}`);
  }
};

const fetchEvent = async (eventId?: string) => {
  try {
    const res = await getPublicEvent(eventId);
    const event = await res.data;
    return event;
  } catch (error) {
    console.error(`Failed to fetch event: ${error}`);
  }
};

const LiveTrack = () => {
  const { trackId } = useParams();
  const [track, setTrack] = useState<Track>();
  const [url, setUrl] = useState<string>();
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

  const changeQuality = (quality: string) => {
    setUrl(url?.split('.m3u8')[0].split('_')[0] + quality + '.m3u8');
  };

  useEffect(() => {
    const fetchTrackData = async () => {
      const track = await fetchTrack(trackId);
      if (!track) {
        console.error('Error while fetching track');
        return;
      }
      track.event = await fetchEvent(track.eventId);
      setTrack(track);
      setUrl(
        `${process.env.REACT_APP_STREAM_URL}/hls/${track?.streamKey}.m3u8`,
      );
    };

    fetchTrackData();
  }, [trackId]);

  const { t } = useTranslation();

  return (
    <div className={styles.livePage}>
      {track ? (
        <>
          <div className={styles.liveHeader}>
            <div className={styles.liveHeaderLeft}>
              <NavigateBackButton />
              <h1 className={styles.eventTitle}>{track.event.name}</h1>
            </div>
            <Button label={t('CloseTrack')} onClick={fetchCloseTrack()} />
          </div>
            <div className={styles.playerWrapper}>
            {/* {url ? ( */}
            {/* <div>
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
            </div> */}
            {/* ) : ( */}
            <WaitingScreen />
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

          <div className={styles.trackInfo}>
            <div className={styles.trackTitle}>
              <h2>{track.name}</h2>
              <Button
                label={t('settings')}
                onClick={() =>
                  navigate(
                    `/events/${track.event.id}/track-settings/${trackId}`,
                  )
                }
              />
            </div>
            <div className={styles.description}>{track.description}</div>
          </div>
        </>
      ) : (
        <h1>{t('Loading')}</h1>
      )}
    </div>
  );
};

export default LiveTrack;
