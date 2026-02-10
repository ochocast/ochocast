import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import styles from './Thumbnail.module.css';
import Tag from '../../generic/Tag/Tag';
import { useBrandingContext } from '../../../../context/BrandingContext';
import { useNavigate } from 'react-router-dom';
import { getMiniature } from '../../../../utils/api';
import Button, { ButtonType } from '../../generic/Button/Button';
import FavorisNotSelected from '../../../../assets/FavorisNotSelected.svg';
import { useTranslation } from 'react-i18next';
import {
  addToFavorites,
  removeFromFavorites,
  isVideoFavorite,
} from '../../../../utils/api';
import FavorisFilterSelected from '../../../../assets/FavorisFilterSelected.svg';
const IMAGE_TUILE_EVENT = '/branding/exemple/image_tuile_event.png';

export interface PreviewMinitureProps {
  Id: string;
  title: string;
  imageSrc?: string;
  createBy: string;
  createdAt: string;
  tags: string[];
  onArchived?: (id: string) => void;
  showEditButton?: boolean;
  onTagClick?: (tag: string) => void;
  cropTags?: boolean;
  duration?: number;
}

const Thumbnail = (props: PreviewMinitureProps) => {
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const { getImageUrl } = useBrandingContext();
  const [fallbackMiniatureUrl, setFallbackMiniatureUrl] = useState<
    string | null
  >(null);
  const [visibleTagsCount, setVisibleTagsCount] = useState<number>(
    props.tags?.length || 0,
  );
  const tagListRef = React.useRef<HTMLDivElement>(null);
  const [showAllTags, setShowAllTags] = useState<boolean>(false);
  const popupRef = React.useRef<HTMLDivElement>(null);
  const moreBadgeRef = React.useRef<HTMLDivElement>(null);
  const [popupPosition, setPopupPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);

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

  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    if (props.onTagClick) {
      props.onTagClick(tag);
    }
  };

  const [miniatureURL, setMiniatureUrl] = useState<string>(
    IMAGE_TUILE_EVENT,
    // process.env.DEFAULT_MINIATURE_IMAGE
  );
  const navigate = useNavigate();
  const { t } = useTranslation();

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

  // Calculer combien de tags peuvent être affichés sur une ligne
  useEffect(() => {
    if (!props.cropTags || !tagListRef.current || !props.tags) {
      setVisibleTagsCount(props.tags?.length || 0);
      return;
    }

    // Simuler l'affichage pour calculer combien de tags rentrent
    const containerWidth = tagListRef.current.offsetWidth;
    let totalWidth = 0;
    let count = 0;
    const gapWidth = 8; // 0.5rem = 8px
    const badgeWidth = 50; // Largeur estimée du badge "+X"

    for (let i = 0; i < props.tags.length; i++) {
      // Estimation de la largeur d'un tag (padding + texte)
      const tagText =
        props.tags[i].length > 8
          ? props.tags[i].substring(0, 8) + '...'
          : props.tags[i];
      const estimatedWidth = tagText.length * 8 + 24; // 8px par caractère + padding

      if (
        totalWidth + estimatedWidth + (i > 0 ? gapWidth : 0) + badgeWidth >
        containerWidth
      ) {
        break;
      }

      totalWidth += estimatedWidth + (i > 0 ? gapWidth : 0);
      count++;
    }

    setVisibleTagsCount(Math.max(1, count)); // Au moins 1 tag visible
  }, [props.tags, props.cropTags]);

  // Gérer le clic en dehors du popup
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

  const dateDisplay = new Date(props.createdAt); // to be able to getDay..

  function formatNumber(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  const truncateTag = (tag: string): string => {
    if (!props.cropTags) return tag;
    return tag.length > 8 ? tag.substring(0, 8) + '...' : tag;
  };

  const handleMoreBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newState = !showAllTags;
    setShowAllTags(newState);
    if (newState && moreBadgeRef.current) {
      const rect = moreBadgeRef.current.getBoundingClientRect();
      setPopupPosition({
        top: rect.bottom + window.scrollY + 8, // 8px gap
        left: rect.left + window.scrollX,
      });
    }
  };

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

  return (
    <div
      className={styles.previewMiniture}
      onClick={() => navigate(`/video/${props.Id}`)}
    >
      <div className={styles.thumbnailContainer}>
        <img
          className={styles.imageTuileEventIcon}
          alt=""
          src={props.imageSrc === undefined ? miniatureURL : props.imageSrc}
          sizes="(max-width: 20rem) 100vw, 20rem"
        />
        {props.duration && (
          <div className={styles.durationBadge}>
            {formatDuration(props.duration)}
          </div>
        )}
      </div>
      <div
        className={
          props.showEditButton ? styles.descriptionNoButton : styles.description
        }
      >
        <h2 className={styles.title}>{props.title}</h2>
        <h3 className={styles.createBy}>
          {' '}
          {t('createdBy')} : {props.createBy}
        </h3>
        <div>
          {t('postedOn')}{' '}
          {`${formatNumber(dateDisplay.getDate())}/${formatNumber(
            dateDisplay.getMonth() + 1,
          )}/${dateDisplay.getFullYear()}`}
        </div>
        <div className={styles.tagList} ref={tagListRef}>
          {props.tags &&
            props.tags.slice(0, visibleTagsCount).map((tag) => (
              <div
                key={tag}
                onClick={(e) => handleTagClick(e, tag)}
                className={
                  props.cropTags ? styles.tagWrapper : styles.tagWrapperNoCrop
                }
              >
                <Tag content={truncateTag(tag)} />
              </div>
            ))}
          {props.cropTags &&
            props.tags &&
            props.tags.length > visibleTagsCount && (
              <div className={styles.moreBadgeContainer} ref={moreBadgeRef}>
                <div
                  className={styles.moreBadge}
                  onClick={handleMoreBadgeClick}
                >
                  +{props.tags.length - visibleTagsCount}
                </div>
                {showAllTags &&
                  (typeof document !== 'undefined'
                    ? ReactDOM.createPortal(
                        <div
                          className={styles.tagsPopup}
                          ref={popupRef}
                          style={{
                            position: 'absolute',
                            top: popupPosition
                              ? `${popupPosition.top}px`
                              : undefined,
                            left: popupPosition
                              ? `${popupPosition.left}px`
                              : undefined,
                          }}
                        >
                          <div className={styles.tagsPopupContent}>
                            {props.tags.slice(visibleTagsCount).map((tag) => (
                              <div
                                key={tag}
                                onClick={(e) => handleTagClick(e, tag)}
                                className={styles.tagWrapper}
                              >
                                <Tag content={truncateTag(tag)} />
                              </div>
                            ))}
                          </div>
                        </div>,
                        document.body,
                      )
                    : null)}
              </div>
            )}
        </div>
        {props.showEditButton ? (
          <div className={styles.buttonList}>
            <Button
              type={ButtonType.primary}
              label={t('modify')}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/video/video-settings/${props.Id}`);
              }}
            />
          </div>
        ) : (
          <div />
        )}
      </div>
      <img
        className={styles.starIconContainer}
        src={isFavorite ? FavorisFilterSelected : FavorisNotSelected}
        alt=""
        onClick={toggleFavorite}
      />
    </div>
  );
};

export default Thumbnail;
