import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { EventStatus } from '../../../../utils/EventStatus';

import styles from './EventBox.module.css';

import Button, { ButtonType } from '../../generic/Button/Button';
import { PublicEvent } from '../../../../utils/EventsProperties';
import { subscribeEvent, unsubscribeEvent } from '../../../../utils/api';
import { t } from 'i18next';

import { useBrandingContext } from '../../../../context/BrandingContext';
import { useUser } from '../../../../context/UserContext';

interface EventBoxProps {
  event: PublicEvent;
  imageURL?: string;
  eventStatus: EventStatus;
  onPublish?: (eventId: string) => void;
  onSubscriptionChange?: () => void;
}

const EventBox = (props: EventBoxProps) => {
  const event = props.event;
  const dateDisplay = new Date(event.startDate);
  const navigate = useNavigate();
  const [nbSubscribe, setNbSubscribe] = useState(event.nbSubscription);
  const { getImageUrl } = useBrandingContext();
  const { user } = useUser();
  const [defaultLogoUrl, setDefaultLogoUrl] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState<boolean>(false);

  useEffect(() => {
    const fetchDefaultLogo = async () => {
      try {
        const url = await getImageUrl('default_miniature_image');
        setDefaultLogoUrl(url);
      } catch (error) {
        console.error('Error fetching default logo:', error);
      }
    };
    fetchDefaultLogo();
  }, [getImageUrl]);

  // Check if current user is subscribed to this event
  useEffect(() => {
    if (user && event.subscribedUserIds) {
      setIsSubscribed(event.subscribedUserIds.includes(user.id));
    }
  }, [user, event]);

  // Check if current user is the event creator
  const isEventCreator = user && event.creatorId === user.id;

  const editButton = (
    <div className={styles.editButton}>
      <Button
        label="✏️"
        type={ButtonType.primary}
        onClick={() => navigate(`/events/${event.id}/event-settings`)}
      />
    </div>
  );

  const buttonsPublished = (
    <div className={styles.subscribeWrapper}>
      {isEventCreator ? (
        <div className={styles.organizerBadge}>
          <span>{`${t('Organizer')}`}</span>
        </div>
      ) : !isSubscribed ? (
        <Button
          label={t('Register')}
          type={ButtonType.primary}
          onClick={async (e) => {
            e.stopPropagation();
            if ((await subscribeEvent(event.id)).status === 200) {
              setNbSubscribe(nbSubscribe + 1);
              setIsSubscribed(true);
              props.onSubscriptionChange?.();
            }
          }}
        />
      ) : (
        <div className={styles.subscribedContainer}>
          <Button
            label={t('Unregister')}
            type={ButtonType.secondary}
            onClick={async (e) => {
              e.stopPropagation();
              if ((await unsubscribeEvent(event.id)).status === 200) {
                setNbSubscribe(nbSubscribe - 1);
                setIsSubscribed(false);
                props.onSubscriptionChange?.();
              }
            }}
          />
        </div>
      )}
      <div className={styles.subscriptionsWrapper}>
        <span className={styles.dot}></span>
        <span className={styles.subscritpions}>
          {`${nbSubscribe} ` + t('registered')}
        </span>
      </div>
    </div>
  );

  const buttonsNotPublished = (
    <div className={styles.centerWrapper}>
      <Button
        label={t('Publish')}
        type={ButtonType.primary}
        onClick={() => props.onPublish && props.onPublish(event.id)}
      />
    </div>
  );

  const buttonsFinished = (
    <div className={styles.centerWrapper}>
      <Button
        label={t('statistics')}
        type={ButtonType.primary}
        onClick={() => navigate(`/events/${event.id}/event-statistics`)}
      />
    </div>
  );

  const buttonsPreview = (
    <div className={styles.subscribeWrapper}>
      <Button label={t('Register')} type={ButtonType.primary} />
      <div className={styles.subscriptionsWrapper}>
        <span className={styles.dot}></span>
        <span className={styles.subscritpions}>{`12 ` + t('registered')}</span>
      </div>
    </div>
  );

  return (
    <div
      className={styles.box}
      onClick={() => {
        if (props.eventStatus !== EventStatus.Preview) {
          navigate(`/events/${event.id}/tracks`);
        }
      }}
    >
      <div className={styles.imgWrapper}>
        <img
          className={styles.img}
          src={
            props.imageURL || defaultLogoUrl || '/exemple/image_tuile_event.png'
          }
          onError={(e) => {
            e.currentTarget.onerror = null;
            e.currentTarget.src =
              defaultLogoUrl || '/exemple/image_tuile_event.png';
          }}
          alt="img"
        ></img>
        {props.event.canBeEditByUser &&
          props.eventStatus !== EventStatus.Preview &&
          editButton}
      </div>
      <div className={styles.eventWrapper}>
        <div className={styles.title}>{event.name}</div>
        <div className={styles.date}>
          {t('StartDate') +
            `${dateDisplay.getDate()}/${
              dateDisplay.getMonth() + 1
            }/${dateDisplay.getFullYear()}`}
        </div>
        {/* Affichage des tags (max 2) */}
        {event.tags && event.tags.length > 0 && (
          <div className={styles.tagsWrapper}>
            {event.tags.slice(0, 3).map((tag, index) => (
              <span key={index} className={styles.tag}>
                {tag.name}
              </span>
            ))}
            {event.tags.length > 3 && (
              <span className={styles.moreTagsIndicator}>
                +{event.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      <div className={styles.eventWrapper}>
        <div className={styles.info}>
          {t('CreatedBy') + event.creator
            ? event.creator.firstName + ' ' + event.creator.lastName
            : '' + t('CreatorUnknown')}
        </div>
      </div>
      {props.eventStatus === EventStatus.Published && buttonsPublished}
      {props.eventStatus === EventStatus.NotPublished && buttonsNotPublished}
      {props.eventStatus === EventStatus.Finished && buttonsFinished}
      {props.eventStatus === EventStatus.Preview && buttonsPreview}
    </div>
  );
};

export default EventBox;
