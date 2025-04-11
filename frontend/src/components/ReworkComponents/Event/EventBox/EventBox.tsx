import React from 'react';
import { useNavigate } from 'react-router-dom';

import { EventStatus } from '../../../../utils/EventStatus';

import './EventBox.css';

import Button, { ButtonType } from '../../generic/Button/Button';
import Event from '../../../../utils/EventsProperties';

interface EventBoxProps {
  event: Event;
  imageURL?: string;
  eventStatus: EventStatus;
  onPublish?: (eventId: string) => void;
  canEdit?: boolean;
}

const EventBox = (props: EventBoxProps) => {
  const event = props.event;
  const dateDisplay = new Date(event.startDate); // to be able to getDay
  const navigate = useNavigate();

  const editButton = (
    <div className="wrapper-edit-button">
      <Button
        label="✏️"
        type={ButtonType.primary}
        onClick={() => navigate(`/events/${event.id}/event-settings`)}
      />
    </div>
  );

  const buttonsPublished = (
    <div className="event-subscribe-wrapper">
      <Button label="S'inscrire" type={ButtonType.primary} />
      <div className="event-subscriptions-wrapper">
        <span className="dot"></span>
        <span className="event-subscritpions">{`${
          0 /*event.subscriptions*/
        } inscrits`}</span>
      </div>
    </div>
  );

  const buttonsNotPublished = (
    <div className="event-button-center-wrapper">
      <Button
        label="Publier"
        type={ButtonType.primary}
        onClick={() => props.onPublish && props.onPublish(event.id)}
      />
    </div>
  );

  const buttonsFinished = (
    <div className="event-button-center-wrapper">
      <Button label="Statistiques" type={ButtonType.primary} />
    </div>
  );

  return (
    <div className="event-box">
      <div className="img-div">
        <img
          className="event-image"
          src={require('../../../../assets/' + props.imageURL)}
          alt="img"
        ></img>
        {props.canEdit && editButton}
      </div>
      <div className="event-wrapper">
        <div
          className="event-title"
          onClick={() => navigate(`/events/${event.id}/tracks`)}
        >
          {event.name}
        </div>
        <div className="event-date">{`Date de début: ${dateDisplay.getDay()}/${
          dateDisplay.getMonth() + 1
        }/${dateDisplay.getFullYear()}`}</div>
      </div>
      <div className="event-wrapper">
        <div className="event-info">{`Créé par : ${
          event.creator.firstName + ' ' + event.creator.lastName
        }`}</div>
      </div>
      {props.eventStatus === EventStatus.Published && buttonsPublished}
      {props.eventStatus === EventStatus.NotPublished && buttonsNotPublished}
      {props.eventStatus === EventStatus.Finished && buttonsFinished}
    </div>
  );
};

export default EventBox;
