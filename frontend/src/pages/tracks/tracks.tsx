import React, { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import TrackBox from '../../components/ReworkComponents/Event/Track/TrackBox/TrackBox';
import { PublicEvent } from '../../utils/EventsProperties';

import './tracks.css';
import { getEventsMiniature, getPublicEvent } from '../../utils/api';
import NavigateBackButton from '../../components/buttons/NavigateBackButton/NavigateBackButton';
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
  <div className="tracks_container">
    {event.tracks.map((track, index) => (
      <TrackBox key={index} track={track} />
    ))}
  </div>
) : (
  <p className="no_tracks_message">
    {t('NoTracks')}
  </p>
);

  return (
    <div className="tracks">
      <div className="tracks_page_title_wrapper">
        <NavigateBackButton />
        <span className="tracks_page_title">
          {t('EventTracks')} {event?.name}
        </span>
      </div>
      <div className="tracks_header">
        {miniatureURL && (
          <div className="tracks_miniature_container">
            <img src={miniatureURL} alt="Miniature" className="tracks_miniature" />
          </div>
        )}
        <div className="tracks_description">
          <div className="tracks_title">{t('EventDescription')}</div>
          {event?.description}
        </div>
      </div>
      {tracklist}
    </div>
  );
};

export default TracksPage;
