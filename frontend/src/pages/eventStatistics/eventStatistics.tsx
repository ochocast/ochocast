import { FC, useState, useEffect } from 'react';
import React from 'react';
import './eventStatistics.css';
import Button from '../../components/ReworkComponents/generic/Button/Button';
import { useNavigate, useParams } from 'react-router-dom';
import MenuTracks from '../../components/ReworkComponents/Event/Track/MenuTracks/MenuTracks';
import { getPrivateEvent } from '../../utils/api';
import trackSelectImage from '../../assets/tracksIconeSelect.png';
import rouageImage from '../../assets/rouage.svg';
import { PublicUser, Track } from '../../utils/EventsProperties';
import logger from '../../utils/logger';
import { useTranslation } from 'react-i18next';

interface EventStatisticProps {}

const EventStatistic: FC<EventStatisticProps> = () => {
  const { t } = useTranslation();
  const { eventId } = useParams();

  const [eventClosed, setEventClosed] = useState(false);

  const navigate = useNavigate();

  const [tracks, setTracks] = useState<Track[]>([]);

  const [isFetchError, setIsFetchError] = useState(false);

  const [creatorId, setCreatorId] = useState('');
  const userString = localStorage.getItem('backendUser');
  const userId = userString ? JSON.parse(userString).id : '';

  const [subscribeUser, setSubscribeUser] = useState<PublicUser[]>([]);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await getPrivateEvent(eventId);
        if (res.status === 200) {
          if (res.data.closed) setEventClosed(true);
          console.log(res.data);
          setTracks(res.data.tracks);
          setCreatorId(res.data.creator.id);
          setSubscribeUser(res.data.usersSubscribe);
        }
      } catch (error) {
        logger.error(`Failed to fetch event: ${error}`);
        setIsFetchError(true);
      }
    };
    fetchEvent();
  }, [eventId]);

  if (isFetchError)
    return (
      <Button
        label={t('eventUnavailableReturnPresentationPage')}
        onClick={() => navigate('/events')}
      />
    );

  const body = (
    <div className="user-subscribe-wrapper">
      <h3 className="user-subscribe-title">
        {t('registeredUsers')} ({subscribeUser.length})
      </h3>
      <div className="user-subscribe-container">
        {subscribeUser.map((user: PublicUser) => (
          <p key={user.id} className="user-subscribe">
            {user.firstName + ' ' + user.lastName}
          </p>
        ))}
      </div>
    </div>
  );

  return (
    <div className="page-event-settings">
      <div className="navigation">
        <h1>{t('dashboard')}</h1>
        <div className="settings-img-button">
          <img className="image-settings" src={rouageImage} alt="iconeSelect" />
          <button
            className="button-settings"
            type="button"
            onClick={() => navigate(`/events/${eventId}/event-settings`)}
          >
            {t('settings')}
          </button>
        </div>
        <div className="settings-img-button">
          <img className="image-settings" src={rouageImage} alt="iconeSelect" />
          <button
            className="button-settings"
            type="button"
            onClick={() => navigate(`/events/${eventId}/event-statistics`)}
          >
            {t('statistics')}
          </button>
        </div>
        <MenuTracks
          tracks={tracks}
          eventId={eventId ?? ''}
          isButtonDisplayed={!eventClosed && userId === creatorId}
          imageUrl={trackSelectImage}
        />
      </div>
      {body}
    </div>
  );
};

export default EventStatistic;
