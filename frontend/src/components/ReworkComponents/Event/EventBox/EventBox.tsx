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
import { getProfilePicture } from '../../../../utils/api';
import EditIcon from '../../../../assets/edit.svg';
import SubscribeIcon from '../../../../assets/subscribe.svg';
import UnsubscribeIcon from '../../../../assets/unsubscribe.svg';

const DEFAULT_PERSONA_IMAGE = '/branding/persona.png';

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
  const [showAllTags, setShowAllTags] = useState<boolean>(false);
  const [profilePictureUrl, setProfilePictureUrl] = useState<string>(
    DEFAULT_PERSONA_IMAGE,
  );

  function formatNumber(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  const getEventDisplayTime = (
    startDateRaw: Date | string,
    endDateRaw?: Date | string,
  ): string => {
    const now = new Date();
    const start = new Date(startDateRaw);
    const end = endDateRaw ? new Date(endDateRaw) : null;

    // 1. Si on est entre la date de début et la date de fin : C'est en direct !
    if (now >= start && (!end || now <= end)) {
      return 'Live';
    }

    // 2. Si la date de fin est passée : C'est terminé.
    if (end && now > end) {
      const diffMs = end.getTime() - start.getTime();

      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
      );
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (days > 0) {
        return `${days}d ${hours}h`;
      } else if (hours > 0) {
        return `${hours}h ${minutes}min`;
      } else {
        return `${Math.max(0, minutes)} min`;
      }
    }

    // 3. Sinon (now < start), c'est dans le futur : on calcule le temps restant.
    const diffMs = start.getTime() - now.getTime();
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor(
      (diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
    );
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) {
      return `In ${days}d ${hours}h`;
    } else if (hours > 0) {
      return `In ${hours}h ${minutes}min`;
    } else {
      return `In ${minutes} min`;
    }
  };

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

  useEffect(() => {
    const fetchMiniatureUrl = async () => {
      try {
        if (props.event.creatorId) {
          const url = await getProfilePicture(props.event.creatorId);
          if (
            url?.data &&
            typeof url.data === 'string' &&
            !url.data.includes('miniatureundefined')
          ) {
            setProfilePictureUrl(url.data);
          } else {
            setProfilePictureUrl(DEFAULT_PERSONA_IMAGE);
          }
        } else {
          setProfilePictureUrl(DEFAULT_PERSONA_IMAGE);
        }
      } catch (error) {
        console.error('Error fetching profile picture', error);
        setProfilePictureUrl(DEFAULT_PERSONA_IMAGE);
      }
    };
    fetchMiniatureUrl();
  }, [props.event.creatorId]);

  // Check if current user is the event creator
  const isEventCreator = user && event.creatorId === user.id;

  const editButton = (
    <div className={styles.editContainer}>
      <div className={styles.editButton}>
        <img
          className={styles.editIcon}
          src={EditIcon}
          alt="Modifier"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/events/${event.id}/event-settings`);
          }}
        />
      </div>
    </div>
  );

  const subscribeButton = (
    <div className={styles.subscribeWrapper}>
      {isEventCreator ? (
        <div className={styles.organizerBadge}>
          <span>{`${t('Organizer')}`}</span>
        </div>
      ) : !isSubscribed ? (
        <div className={styles.subscribeContainer}>
          <div className={styles.subscribeButton}>
            <img
              className={styles.editIcon}
              src={SubscribeIcon}
              alt="Subscribe"
              onClick={async (e) => {
                e.stopPropagation();
                if ((await subscribeEvent(event.id)).status === 200) {
                  setNbSubscribe(nbSubscribe + 1);
                  setIsSubscribed(true);
                  props.onSubscriptionChange?.();
                }
              }}
            />
          </div>
        </div>
      ) : (
        <div className={styles.UnsubscribeContainer}>
          <div className={styles.UnsubscribeButton}>
            <img
              className={styles.UnsubscribeIcon}
              src={UnsubscribeIcon}
              alt="unsubscribe"
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
        </div>
      )}
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

  const handleMoreBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAllTags(!showAllTags);
  };

  return (
    <div
      className={styles.previewMiniture}
      onClick={() => {
        if (props.eventStatus !== EventStatus.Preview) {
          navigate(`/events/${event.id}/tracks`);
        }
      }}
    >
      {/* Top container with image and overlays */}
      <div className={styles.topContainer}>
        <img
          className={styles.imageTuileEventIcon}
          alt={props.event.name}
          src={
            props.imageURL || defaultLogoUrl || '/exemple/image_tuile_event.png'
          }
        />

        {/* Edit button */}
        {props.event.canBeEditByUser &&
          props.eventStatus !== EventStatus.Preview &&
          editButton}

        {/* Subscribe button */}
        {props.eventStatus === EventStatus.Published && subscribeButton}

        {/* View container */}
        <div className={styles.viewsContainer}>
          <div className={styles.viewValue}>
            {`${nbSubscribe} ` + t('registered')}
          </div>
        </div>

        {/* Time container */}
        {getEventDisplayTime(props.event.startDate, props.event.endDate) !==
        'Live' ? (
          <div className={styles.timeContainer}>
            <div className={styles.timeValue}>
              {getEventDisplayTime(props.event.startDate, props.event.endDate)}
            </div>
          </div>
        ) : (
          <div className={styles.timeContainerLive}>
            <div className={styles.timeValueLive}>
              {getEventDisplayTime(props.event.startDate, props.event.endDate)}
            </div>
          </div>
        )}
      </div>

      {/* Bottom container with infos */}
      <div className={styles.bottomContainer}>
        {/* profilePictureContainer */}
        <div className={styles.profilePictureContainer}>
          <img
            className={styles.profilePicture}
            src={profilePictureUrl}
            alt={`${props.event.creator.firstName} ${props.event.creator.lastName}'s profile`}
          />
        </div>

        {/* textContainer */}
        <div className={styles.textContainer}>
          <div className={styles.titleContainer}>
            <h2 className={styles.title} title={props.event.name}>
              {props.event.name}
            </h2>
          </div>

          <div className={styles.infoContainer}>
            <div className={styles.authorContainer}>
              {props.event.creator.firstName +
                ' ' +
                props.event.creator.lastName}
            </div>

            <span className={styles.separator}>•</span>

            <div className={styles.dateContainer}>
              {`${formatNumber(dateDisplay.getDate())}/${formatNumber(
                dateDisplay.getMonth() + 1,
              )}/${dateDisplay.getFullYear()}`}
            </div>

            {event.tags && event.tags.length > 0 && (
              <div className={styles.tagsContainer}>
                <button
                  className={styles.tagTriggerButton}
                  onClick={handleMoreBadgeClick}
                >
                  <span className={styles.tagLabel}>Tags</span>
                  <span className={styles.tagCount}>{event.tags.length}</span>
                </button>

                {showAllTags && (
                  <>
                    {/* L'overlay reste au niveau de l'écran entier pour capter le clic de fermeture */}
                    <div
                      className={styles.tagsPopupOverlay}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAllTags(false);
                      }}
                    />
                    {/* Le popup est maintenant positionné par rapport au tagsContainer */}
                    <div className={styles.tagsPopup}>
                      <div className={styles.tagsPopupContent}>
                        {event.tags.map((tag, index) => (
                          <span key={index} className={styles.tag}>
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {props.eventStatus === EventStatus.NotPublished && buttonsNotPublished}
      {props.eventStatus === EventStatus.Finished && buttonsFinished}
      {props.eventStatus === EventStatus.Preview && buttonsPreview}
    </div>
  );
};

export default EventBox;
