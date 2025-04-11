import React, { useState } from 'react';
import Event from '../../../../utils/EventsProperties';
import { EventStatus } from '../../../../utils/EventStatus';

import leftButton from '../../../../assets/gauche.png';
import rightButton from '../../../../assets/droite.png';

import EventBox from '../EventBox/EventBox';

import './EventsList.css';

interface EventsListProps {
  eventStatus: EventStatus;
  title: string;
  events: Event[];
  onPublish?: (eventId: string) => void;
  viewerID?: string;
}

const EventsList = (props: EventsListProps) => {
  const [eventsShown, changeEvents] = useState(props.events.slice(0, 3));
  const [index, setIndex] = useState(0);

  const onArrowClick = (arrowDirection: boolean) => {
    if (props.events.length <= 3) return;
    let i = index;

    if (arrowDirection) i = i < props.events.length - 3 ? i + 1 : 0;
    else i = i === 0 ? props.events.length - 3 : i - 1;

    changeEvents(props.events.slice(i, i + 3));
    setIndex(i);
  };

  const buttonGen = (name: string, img: string, onClick: () => void) => (
    <div className={name}>
      <img className="arrow" src={img} alt="Button" onClick={onClick}></img>
    </div>
  );

  const events = eventsShown.map((event, index) => (
    <EventBox
      event={event}
      eventStatus={props.eventStatus}
      key={index}
      imageURL="logo_2lignes_crop.png"
      onPublish={props.onPublish}
      canEdit={props.eventStatus === EventStatus.NotPublished || props.viewerID === event.creator.id}
    />
  ));

  return (
    <div className="events-list">
      <div className="title">{props.title}</div>
      <div className="list">
        {props.events.length > 3 &&
          buttonGen('left-arrow', leftButton, () => onArrowClick(false))}
        <div className="event-container">{events}</div>
        {props.events.length > 3 &&
          buttonGen('right-arrow', rightButton, () => onArrowClick(true))}
      </div>
    </div>
  );
};

export default EventsList;
