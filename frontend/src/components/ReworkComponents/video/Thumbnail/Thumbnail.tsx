import React, { useState, useEffect, useLayoutEffect } from 'react';
import styles from './Thumbnail.module.css';
import { useBrandingContext } from '../../../../context/BrandingContext';
import { useNavigate } from 'react-router-dom';
import { getMiniature } from '../../../../utils/api';
import Star from '../../../../assets/star.svg';
import { useTranslation } from 'react-i18next';
import {
  addToFavorites,
  removeFromFavorites,
  isVideoFavorite,
} from '../../../../utils/api';
import FavorisFilterSelected from '../../../../assets/FavorisSelected.svg';
import ViewIcon from '../../../../assets/ViewIcon.svg';
import EditIcon from '../../../../assets/edit.svg';
import { getProfilePicture } from '../../../../utils/api';
import { useUser } from '../../../../context/UserContext';

const IMAGE_TUILE_EVENT = '/branding/exemple/image_tuile_event.png';
const DEFAULT_PERSONA_IMAGE = '/branding/persona.png';

export interface PreviewMinitureProps {
  Id: string;
  title: string;
  imageSrc?: string;
  creatorId?: string;
  createBy: string;
  createdAt: string;
  tags: string[];
  views?: number; //actuellement pas utilisé, mais peut être utile pour afficher le nombre de vues sur la miniature
  onArchived?: (id: string) => void;
  showEditButton?: boolean;
  onTagClick?: (tag: string) => void;
  cropTags?: boolean;
  duration?: number;
  translations?: Partial<PreviewMinitureTranslations>;
}

export interface PreviewMinitureTranslations {
  editButtonLabel: string;
  addToFavoritesLabel: string;
  removeFromFavoritesLabel: string;
  viewsLabel: string;
  noViewsLabel: string;
  tagsLabel: string;
}

const Thumbnail = (props: PreviewMinitureProps) => {
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const { getImageUrl } = useBrandingContext();
  const [fallbackMiniatureUrl, setFallbackMiniatureUrl] = useState<
    string | null
  >(null);
  const [showAllTags, setShowAllTags] = useState<boolean>(false);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const moreBadgeRef = React.useRef<HTMLDivElement>(null);
  const tagsContainerRef = React.useRef<HTMLDivElement>(null);
  const tagMeasureRef = React.useRef<HTMLDivElement>(null);
  const [visibleTagCount, setVisibleTagCount] = useState<number>(
    props.tags.length,
  );
  const [profilePictureUrl, setProfilePictureUrl] = useState<string>(
    DEFAULT_PERSONA_IMAGE,
  );

  const { user } = useUser();
  const { t } = useTranslation();

  useLayoutEffect(() => {
    const updateVisibleTags = () => {
      const container = tagsContainerRef.current;
      const measurement = tagMeasureRef.current;
      if (!container || !measurement) {
        setVisibleTagCount(props.tags.length);
        return;
      }

      const availableWidth = container.clientWidth;
      if (availableWidth <= 0) {
        setVisibleTagCount(props.tags.length);
        return;
      }

      const tagElements = Array.from(
        measurement.querySelectorAll<HTMLSpanElement>(`.${styles.tag}`),
      );
      const plusButtons = Array.from(
        measurement.querySelectorAll<HTMLButtonElement>(
          '[data-measure-plus="true"]',
        ),
      );
      const plusWidthByCount = new Map<number, number>();
      plusButtons.forEach((button) => {
        const count = Number(button.dataset.count ?? '0');
        plusWidthByCount.set(count, button.getBoundingClientRect().width);
      });

      const gap = 6;
      let usedWidth = 0;
      let count = 0;

      for (let i = 0; i < tagElements.length; i += 1) {
        const tagWidth = tagElements[i].getBoundingClientRect().width;
        const nextWidth = usedWidth + (count > 0 ? gap : 0) + tagWidth;
        const hiddenCount = props.tags.length - (i + 1);
        const plusWidth =
          hiddenCount > 0 ? (plusWidthByCount.get(hiddenCount) ?? 0) : 0;
        const requiredWidth =
          hiddenCount > 0 ? nextWidth + gap + plusWidth : nextWidth;

        if (requiredWidth <= availableWidth) {
          usedWidth = nextWidth;
          count += 1;
        } else {
          break;
        }
      }

      setVisibleTagCount(count);
    };

    const resizeObserver = new ResizeObserver(() => {
      updateVisibleTags();
    });

    if (tagsContainerRef.current) {
      resizeObserver.observe(tagsContainerRef.current);
    }

    window.addEventListener('resize', updateVisibleTags);
    updateVisibleTags();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateVisibleTags);
    };
  }, [props.tags]);

  const translations: PreviewMinitureTranslations = {
    editButtonLabel: props.translations?.editButtonLabel ?? t('modify'),
    addToFavoritesLabel:
      props.translations?.addToFavoritesLabel ?? t('addToFavorites'),
    removeFromFavoritesLabel:
      props.translations?.removeFromFavoritesLabel ?? t('removeFromFavorites'),
    viewsLabel: props.translations?.viewsLabel ?? t('views'),
    noViewsLabel: props.translations?.noViewsLabel ?? t('noViews'),
    tagsLabel: props.translations?.tagsLabel ?? t('Tags'),
  };

  const isCreator = user?.id && props.creatorId && user.id === props.creatorId;
  const canEdit = props.showEditButton || isCreator;

  const toggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (isFavorite) {
        await removeFromFavorites(props.Id);
        setIsFavorite(false);
      } else {
        await addToFavorites(props.Id);
        setIsFavorite(true);
      }
    } catch (error) {
      console.error('Failed to toggle favorite', error);
    }
  };

  const [miniatureURL, setMiniatureUrl] = useState<string>(IMAGE_TUILE_EVENT);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFallbackMiniature = async () => {
      try {
        const url = await getImageUrl('default_miniature_image');
        setFallbackMiniatureUrl(url);
      } catch (error) {
        console.error('Error fetching fallback miniature:', error);
      }
    };
    fetchFallbackMiniature();
  }, [getImageUrl]);

  useEffect(() => {
    const fetchMiniatureUrl = async () => {
      if (props.Id) {
        try {
          const url = await getMiniature(props.Id);
          // TODO: rework this condition
          if (url?.data.includes('miniatureundefined')) {
            return;
          }
          setMiniatureUrl(
            url?.data ||
              fallbackMiniatureUrl ||
              '/branding/exemple/image_tuile_event.png',
          );
        } catch (error) {
          console.error('Error fetching miniature URL', error);
        }
      }
    };

    const fetchFavoriteStatus = async () => {
      try {
        const result = await isVideoFavorite(props.Id);
        setIsFavorite(result);
      } catch (error) {
        console.error('Error checking favorite status', error);
      }
    };

    fetchMiniatureUrl();
    fetchFavoriteStatus();
  }, [props.Id, fallbackMiniatureUrl]);

  useEffect(() => {
    const fetchMiniatureUrl = async () => {
      try {
        if (props.creatorId) {
          const url = await getProfilePicture(props.creatorId);
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
  }, [props.creatorId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        setShowAllTags(false);
      }
    };

    if (showAllTags) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAllTags]);

  const handleMoreBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAllTags(!showAllTags);
  };

  const visibleCount = Math.max(
    0,
    Math.min(visibleTagCount, props.tags.length),
  );
  const displayedTags = props.tags?.slice(0, visibleCount) ?? [];
  const hiddenTags = props.tags?.slice(visibleCount) ?? [];

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getRelativeTime = (dateString: string): string => {
    const past = new Date(dateString).getTime();
    const now = new Date().getTime();
    const diffInSeconds = Math.floor((now - past) / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);

    if (diffInMinutes < 60) {
      const mins = Math.max(diffInMinutes, 0);
      if (mins === 0) return t('timeAgo.now');
      return t('timeAgo.minutes', { count: mins });
    }

    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
      return t('timeAgo.hours', { count: diffInHours });
    }

    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 30) {
      return t('timeAgo.days', { count: diffInDays });
    }

    const diffInMonths = Math.floor(diffInDays / 30);
    if (diffInMonths < 12) {
      return t('timeAgo.months', { count: diffInMonths });
    }

    const diffInYears = Math.floor(diffInDays / 365);
    return t('timeAgo.years', { count: diffInYears });
  };

  return (
    <div
      className={styles.previewMiniture}
      onClick={() => navigate(`/video/${props.Id}`)}
      onMouseLeave={() => setShowAllTags(false)}
    >
      <div className={styles.topContainer}>
        <img
          className={styles.imageTuileEventIcon}
          alt={props.title}
          src={props.imageSrc === undefined ? miniatureURL : props.imageSrc}
        />
        {canEdit && (
          <div className={styles.editContainer}>
            <img
              className={styles.editIcon}
              src={EditIcon}
              alt={translations.editButtonLabel}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/video/video-settings/${props.Id}`);
              }}
            />
          </div>
        )}
        <div className={styles.starContainer}>
          <img
            className={styles.starIcon}
            src={isFavorite ? FavorisFilterSelected : Star}
            alt={
              isFavorite
                ? translations.removeFromFavoritesLabel
                : translations.addToFavoritesLabel
            }
            onClick={toggleFavorite}
          />
        </div>

        <div className={styles.viewsContainer}>
          <img
            className={styles.viewIcon}
            src={ViewIcon}
            alt={translations.viewsLabel}
          />
          <div className={styles.viewValue}>
            {props.views !== undefined
              ? props.views
              : translations.noViewsLabel}
          </div>
        </div>

        {props.duration && (
          <div className={styles.timeContainer}>
            <div className={styles.timeValue}>
              {formatDuration(props.duration)}
            </div>
          </div>
        )}
      </div>

      <div className={styles.bottomContainer}>
        <div className={styles.bottomContainerUpperPart}>
          <div className={styles.profilePictureContainer}>
            <img
              className={styles.profilePicture}
              src={profilePictureUrl}
              alt={`${props.createBy}'s profile`}
            />
          </div>

          <div className={styles.textContainer}>
            <div className={styles.titleContainer}>
              <h2 className={styles.title} title={props.title}>
                {props.title}
              </h2>
            </div>

            <div className={styles.infoContainer}>
              <div className={styles.authorContainer}>{props.createBy}</div>

              <span className={styles.separator}>•</span>

              <div className={styles.dateContainer}>
                {getRelativeTime(props.createdAt)}
              </div>
            </div>
          </div>
        </div>

        <div className={styles.bottomContainerLowerPart}>
          <div className={styles.tagsContainer} ref={tagsContainerRef}>
            {displayedTags.length > 0 && (
              <>
                {displayedTags.map((tag, index) => (
                  <span key={index} className={styles.tag}>
                    {tag}
                  </span>
                ))}
              </>
            )}

            {hiddenTags.length > 0 && (
              <div className={styles.tagTriggerWrapper} ref={moreBadgeRef}>
                <button
                  className={styles.tagTriggerButton}
                  onClick={handleMoreBadgeClick}
                  aria-label={`+${hiddenTags.length} tags restants`}
                >
                  <span className={styles.tagCount}>+{hiddenTags.length}</span>
                </button>

                {showAllTags && (
                  <>
                    <div
                      className={styles.tagsPopupOverlay}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowAllTags(false);
                      }}
                    />
                    <div className={styles.tagsPopup}>
                      <div className={styles.tagsPopupContent}>
                        {hiddenTags.map((tag, index) => (
                          <span key={index} className={styles.tag}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <div
            className={styles.tagMeasurementContainer}
            ref={tagMeasureRef}
            aria-hidden="true"
          >
            {props.tags.map((tag, index) => (
              <span key={index} className={styles.tag}>
                {tag}
              </span>
            ))}
            {Array.from({ length: props.tags.length + 1 }, (_, count) => (
              <button
                key={count}
                data-count={count}
                data-measure-plus="true"
                className={styles.tagTriggerButton}
                type="button"
              >
                <span className={styles.tagCount}>+{count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Thumbnail;
