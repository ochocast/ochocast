import { FC, useState, useEffect } from 'react';
import React from 'react';
import styles from './eventStatistics.module.css';
import Button from '../../components/ReworkComponents/generic/Button/Button';
import { useNavigate, useParams } from 'react-router-dom';
import { getPrivateEvent } from '../../utils/api';
import { PublicUser, Track } from '../../utils/EventsProperties';
import logger from '../../utils/logger';
import { useTranslation } from 'react-i18next';
import EventDashboard from '../../components/ReworkComponents/Event/EventDashboard/EventDashboard';

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
    <div className={styles.UserSubscribeWrapper}>
      <h3 className={styles.UserSubscribeTitle}>
        {t('registeredUsers')} ({subscribeUser.length})
      </h3>
      <div className={styles.UserSubscribeContainer}>
        {subscribeUser.map((user: PublicUser) => (
          <p key={user.id} className={styles.UserSubscribe}>
            {user.firstName + ' ' + user.lastName}
          </p>
        ))}
      </div>
    </div>
  );

  return (
    <div className={styles.PageEventSettings}>
      <EventDashboard
        eventId={eventId}
        tracks={tracks}
        eventClosed={!eventClosed && userId === creatorId}
      />
      <div className={styles.bodyWrapper}>{body}</div>
    </div>
  );
};

export default EventStatistic;
