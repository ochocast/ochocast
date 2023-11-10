import React from 'react';
import { FC, useState } from 'react';
import Event from '../../utils/EventsProperties';
import { EventStatus } from '../../utils/EventStatus';

import leftButton from '../../assets/gauche.png';
import rightButton from '../../assets/droite.png';

import EventBox from '../EventBox/EventBox';

import './EventsList.css';

interface EventsListProps {
  eventStatus: EventStatus;
  title: string;
  events?: Event[];
}

const EventsList: FC<EventsListProps> = ({
  eventStatus,
  title,
  events = [],
}) => {
  const [eventsShown, changeEvents] = useState(events);
  const [index, setIndex] = useState(0); // index of navigation

  // Navigate between events when clicking arrows
  const onArrowClick = (arrowDirection: boolean) => {
    let i = index;
    if (events.length > 3) {
      if (arrowDirection === false) {
        if (i === 0) i = events.length - 3;
        else i = i - 1;
      } else {
        if (i < events.length - 3) i = i + 1;
        else i = 0;
      }
      const newEvents = events.slice(i, i + 3);
      changeEvents(newEvents);
      setIndex(i);
    }
  };

  return (
    <div className="events-list">
      <div className="title">{title}</div>
      <div className="list">
        <div className="left-arrow">
          <img
            className="arrow"
            src={leftButton}
            alt="Button"
            onClick={() => onArrowClick(false)}
          ></img>
        </div>
        <div className="event-container">
          {eventsShown.slice(0, 3).map((event, index) => (
            <EventBox
              eventId={event.id}
              eventStatus={eventStatus}
              key={index}
              name={event.name}
              date={event.startDate}
              imageURL="noImage.png"
              createdBy={
                event.creator?.firstName ? event.creator.firstName : 'Swann'
              }
              category={event.category}
            />
          ))}
        </div>
        <div className="right-arrow">
          <img
            className="arrow"
            src={rightButton}
            alt="Button"
            onClick={() => onArrowClick(true)}
          ></img>
        </div>
      </div>
    </div>
  );
};

export default EventsList;
