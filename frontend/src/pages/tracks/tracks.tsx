import React, { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import TrackBox from '../../components/ReworkComponents/Event/Track/TrackBox/TrackBox';
import { PublicEvent } from '../../utils/EventsProperties';

import styles from './tracks.module.css';
import { getEventsMiniature, getPublicEvent } from '../../utils/api';
import NavigateBackButton from '../../components/ReworkComponents/Button/NavigateBackButton/NavigateBackButton';
import { useTranslation } from 'react-i18next';
import fallbackMiniature from '../../assets/logo_2lignes_crop.png';


export interface tracksProps {}

const fetchEvent = async (eventId?: string) => {
  try {
    const res = await getPublicEvent(eventId);
    return await res.data;
  } catch (error) {
    console.error(`Failed to fetch event: ${error}`);
  }
};

const TracksPage: FC<tracksProps> = () => {
  const [event, setEvent] = useState<PublicEvent | undefined>(undefined);
  const { eventId } = useParams();
  const { t } = useTranslation();
  const [miniatureURL, setMiniatureURL] = useState<string | undefined>(undefined);


  useEffect(() => {
    const fetchEventData = async () => {
      const event = await fetchEvent(eventId);
      setEvent(event);
    };

    fetchEventData();
  }, [eventId]);

  useEffect(() => {
  const fetchEventData = async () => {
    const event = await fetchEvent(eventId);
    setEvent(event);

    if (event) {
      try {
        const res = await getEventsMiniature(event.id);
        if (res?.data?.url && !res.data.url.includes('imageSlug')) {
          setMiniatureURL(res.data.url);
        } else {
          setMiniatureURL(fallbackMiniature);
        }
      } catch (err) {
        console.error(`Erreur récupération miniature pour event ${event.id}`, err);
        setMiniatureURL(fallbackMiniature);
      }
    }
  };

  fetchEventData();
}, [eventId]);

const tracklist = event?.tracks?.length ? (
  <div className={styles.tracksContainer}>
    {event.tracks.map((track, index) => (
      <TrackBox key={index} track={track} />
    ))}
  </div>
) : (
  <p className={styles.noTracksMessage}>
    {t('NoTracks')}
  </p>
);

  return (
    <div className={styles.tracks}>
      <div className={styles.tracksPageTitleWrapper}>
        <NavigateBackButton />
        <span className={styles.tracksPageTitle}>
          {t('EventTracks')} {event?.name}
        </span>
      </div>
      <div className={styles.tracksHeader}>
        {miniatureURL && (
          <div className={styles.tracksMiniatureContainer}>
            <img src={miniatureURL} alt="Miniature" className={styles.tracksMiniature} />
          </div>
        )}
        <div className={styles.tracksDescription}>
          <div className={styles.tracksTitle}>{t('EventDescription')}</div>
          {event?.description}
        </div>
      </div>
      {tracklist}
    </div>
  );
};

export default TracksPage;
