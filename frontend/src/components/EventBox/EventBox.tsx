import { FC } from 'react';

import { EventStatus } from '../../utils/EventStatus';

import './EventBox.css'

// Changera probablement a la propriete event contenant toutes les informations necessaires
interface EventBoxProps {
    className?: string,
    name?: string,
    date: Date,
    createdBy?: string,
    category?: string,
    subscriptions?: number,
    imageURL?: string
    eventStatus: EventStatus
}

const EventBox: FC<EventBoxProps> = ({
    name,
    date,
    createdBy,
    category,
    subscriptions = 200,
    imageURL,
    eventStatus
}) => {

    const dateDisplay = new Date(date) // to be able to getDay..

    return (
        <div className="event-box">
            <img className='event-image' src={require('../../assets/' + imageURL)} alt='img'></img>
            <div className='event-wrapper'>
                <div className='event-title'>{name}</div>
                <div className='event-date'>{`Date de début: ${dateDisplay.getDay()}/${dateDisplay.getMonth()+1}/${dateDisplay.getFullYear()}`}</div>
            </div>
            <div className='event-wrapper'>
                <div className='event-info'>{`Créé par : ${createdBy}`}</div>
                <div className='event-info'>{`Catégorie : ${category}`}</div>
            </div>
            {
                (eventStatus === EventStatus.Published) ? (
                    <div className='event-buttons-wrapper'>
                        <button className='button'>S'inscrire</button>
                        <div className='event-subscriptions-wrapper'>
                            <span className='dot'></span>
                            <span className='event-subscritpions'>{`${subscriptions} inscrits`}</span>
                        </div>
                    </div>
                ) : (
                    <div className='event-buttons-wrapper'>
                        <button className='button'>Modifier</button>
                        <button className='button'>Publier</button>
                    </div>
                )
            }

        </div>
    )

}

export default EventBox;
