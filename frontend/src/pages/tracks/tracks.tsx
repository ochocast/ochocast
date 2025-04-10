import React, { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import TrackBox from '../../components/ReworkComponents/live/TrackBox/TrackBox';
import Event from '../../utils/EventsProperties';

import './tracks.css';
import { getEvent } from '../../utils/api';
import NavigateBackButton from '../../components/buttons/NavigateBackButton/NavigateBackButton';

export interface tracksProps {}

const fetchEvent = async (eventId?: string) => {
  try {
    const res = await getEvent(eventId);
    return await res.data;
  } catch (error) {
    console.error(`Failed to fetch event: ${error}`);
  }
};

const TracksPage: FC<tracksProps> = () => {
  const [event, setEvent] = useState<Event | undefined>(undefined);
  const { eventId } = useParams();

  useEffect(() => {
    const fetchEventData = async () => {
      const event = await fetchEvent(eventId);
      setEvent(event[0]);
    };

    fetchEventData();
  }, [eventId]);

  return (
    <div className="tracks">
      <div className="tracks_page_title_wrapper">
        <NavigateBackButton />
        <span className="tracks_page_title">
          Les pistes de l&apos;évènement : {event?.name}
        </span>
      </div>
      <div className="tracks_wrapper">
        <div className="tracks_description">
          <div className="tracks_title">
            Description de l&apos;évènement :
          </div>
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
            data-text="Il n'existe aucune track sur cet évènement pour le moment."
          />
        )}
      </div>
    </div>
  );
};

export default TracksPage;
