import React, { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import TrackBox from '../../components/ReworkComponents/Event/Track/TrackBox/TrackBox';
import { PublicEvent } from '../../utils/EventsProperties';

import './tracks.css';
import { getPublicEvent } from '../../utils/api';
import NavigateBackButton from '../../components/buttons/NavigateBackButton/NavigateBackButton';
import { useTranslation } from 'react-i18next';

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

  useEffect(() => {
    const fetchEventData = async () => {
      const event = await fetchEvent(eventId);
      setEvent(event);
    };

    fetchEventData();
  }, [eventId]);

  return (
    <div className="tracks">
      <div className="tracks_page_title_wrapper">
        <NavigateBackButton />
        <span className="tracks_page_title">
          {t('EventTracks')} {event?.name}
        </span>
      </div>
      <div className="tracks_wrapper">
        <div className="tracks_description">
          <div className="tracks_title">{t('EventDescription')}</div>
          {event?.description}
        </div>
      </div>
      <div className="tracks_container">
        {event && event.tracks && event.tracks.length ? (
          event.tracks.map((track, index) => (
            <TrackBox key={index} track={track}></TrackBox>
          ))
        ) : (
          <div
            className="no_tracks_message"
            data-text={t('NoTracks')}
          />
        )}
      </div>
    </div>
  );
};

export default TracksPage;
