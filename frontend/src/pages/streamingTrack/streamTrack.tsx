import React, { useEffect, useState } from 'react';
import styles from './streamTrack.module.css';
import { useNavigate, useParams } from 'react-router-dom';
import { getTrackById, getPublicEvent, closeTrack } from '../../utils/api';
import { Track } from '../../utils/EventsProperties';
import Button from '../../components/ReworkComponents/generic/Button/Button';
import LiveStream from '../../components/livestream/livestream';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();

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
    <div className={styles.livePage}>
      {track ? (
        <>
          <div className={styles.liveHeader}>
            <h1 className={styles.eventTitle}>{track.event?.name}</h1>
            <Button label={t('CloseTrack')} onClick={fetchCloseTrack()} />
          </div>

          <div className="live-container">
            <LiveStream streamKey={track.streamKey} />
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

export default StreamTrack;
