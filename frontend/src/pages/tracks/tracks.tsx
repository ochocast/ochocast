import React, { FC, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import gauche from './../../assets/gauche.png';

import TrackBox from '../../components/TrackBox/TrackBox';
import Event from '../../utils/EventsProperties';

import './tracks.css';
import { getEvent } from '../../utils/api';

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

  const navigate = useNavigate();

  useEffect(() => {
    const fetchEventData = async () => {
      const event = await fetchEvent(eventId);
      setEvent(event[0]);
    };

    fetchEventData();
  }, [eventId]);

  const handleBackButtonClick = () => {
    navigate('/events');
  };

  return (
    <div className="tracks">
      <div className="tracks_page_title_wrapper">
        <img
          className="back_image"
          src={gauche}
          onClick={handleBackButtonClick}
        ></img>
        <span className="tracks_page_title">
          Les pistes de l&apos;évènement : {event?.name}
        </span>
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
