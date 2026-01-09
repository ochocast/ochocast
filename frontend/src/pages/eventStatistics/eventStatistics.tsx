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
import ChatStatistics from '../../components/ReworkComponents/Event/ChatStatistics/ChatStatistics';
import {
  UsersIcon,
  MicrophoneIcon,
} from '../../components/ReworkComponents/Event/ChatStatistics/StatIcons';

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
  const userId = userString ? JSON.parse(userString)?.id || '' : '';

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
        onClick={() => navigate('/my-events')}
      />
    );

  return (
    <div className={styles.pageContainer}>
      <EventDashboard
        eventId={eventId}
        tracks={tracks}
        eventClosed={!eventClosed && userId === creatorId}
      />
      <div className={styles.content}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>{t('statistics')}</h1>
          <p className={styles.pageSubtitle}>Vue d'ensemble de l'engagement</p>
        </div>

        {/* Quick Stats Overview */}
        <div className={styles.quickStats}>
          <div className={styles.quickStatCard}>
            <div className={styles.quickStatIcon}>
              <UsersIcon size={32} color="var(--theme-color-500)" />
            </div>
            <div className={styles.quickStatInfo}>
              <span className={styles.quickStatValue}>
                {subscribeUser.length}
              </span>
              <span className={styles.quickStatLabel}>
                {t('registeredUsers')}
              </span>
            </div>
          </div>
          <div className={styles.quickStatCard}>
            <div className={styles.quickStatIcon}>
              <MicrophoneIcon size={32} color="var(--theme-color-500)" />
            </div>
            <div className={styles.quickStatInfo}>
              <span className={styles.quickStatValue}>{tracks.length}</span>
              <span className={styles.quickStatLabel}>{t('Tracks')}</span>
            </div>
          </div>
        </div>

        {/* Registered Users Section */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <UsersIcon size={20} style={{ marginRight: 8 }} />{' '}
              {t('registeredUsers')} ({subscribeUser.length})
            </h2>
          </div>
          <div className={styles.usersGrid}>
            {subscribeUser.length > 0 ? (
              subscribeUser.map((user: PublicUser) => (
                <div key={user.id} className={styles.userCard}>
                  <div className={styles.userAvatar}>
                    {user.firstName?.charAt(0)}
                    {user.lastName?.charAt(0)}
                  </div>
                  <span className={styles.userName}>
                    {user.firstName} {user.lastName}
                  </span>
                </div>
              ))
            ) : (
              <p className={styles.emptyState}>Aucun utilisateur inscrit</p>
            )}
          </div>
        </div>

        {/* Chat Statistics Section */}
        <ChatStatistics
          eventId={eventId}
          subscriberCount={subscribeUser.length}
        />
      </div>
    </div>
  );
};

export default EventStatistic;
