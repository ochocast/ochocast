import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FC } from 'react';

import { EventStatus } from '../../utils/EventStatus';

import './EventBox.css';
import { User } from '../../utils/EventsProperties';

// Changera probablement a la propriete event contenant toutes les informations necessaires
interface EventBoxProps {
  eventId?: string;
  name?: string;
  date: Date;
  creator?: User;
  category?: string;
  subscriptions?: number;
  imageURL?: string;
  eventStatus: EventStatus;
  onPublish?: (eventId: string) => void;
}

const EventBox: FC<EventBoxProps> = ({
  eventId = '',
  name,
  date,
  category,
  subscriptions = 200,
  imageURL,
  eventStatus,
  onPublish,
  creator,
}) => {
  const dateDisplay = new Date(date); // to be able to getDay..

  const navigate = useNavigate();

  return (
    <div className="event-box">
      <div className='img-div'>
        <img
          className="event-image"
          src={require('../../assets/' + imageURL)}
          alt="img"
        ></img>
      </div>
      <div className="event-wrapper">
        <div
          className="event-title"
          onClick={() => navigate(`/events/${eventId}/tracks`)}
        >
          {name}
        </div>
        <div className="event-date">{`Date de début: ${dateDisplay.getDay()}/${
          dateDisplay.getMonth() + 1
        }/${dateDisplay.getFullYear()}`}</div>
      </div>
      <div className="event-wrapper">
        <div className="event-info">{`Créé par : ${
          creator?.firstName ? creator.firstName : 'Swann'
        }`}</div>
        <div className="event-info">{`Catégorie : ${category}`}</div>
      </div>
      {eventStatus === EventStatus.Published ? (
        <div className="event-buttons-wrapper">
          <button className="button">S&apos;inscrire</button>
          <div className="event-subscriptions-wrapper">
            <span className="dot"></span>
            <span className="event-subscritpions">{`${subscriptions} inscrits`}</span>
          </div>
        </div>
      ) : (
        <>
          {eventStatus !== EventStatus.Finished ? (
            <div className="event-buttons-wrapper">
              <button
                className="button"
                onClick={() => navigate(`/events/${eventId}/event-settings`)}
              >
                Modifier
              </button>
              <button
                className="button"
                onClick={() => onPublish && onPublish(eventId)}
              >
                Publier
              </button>
            </div>
          ) : (
            <div className="event-button-center-wrapper">
              <button className="button">Statistiques</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default EventBox;
