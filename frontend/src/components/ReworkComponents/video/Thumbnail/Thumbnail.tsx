import React, { useState, useEffect } from 'react';
import styles from './Thumbnail.module.css';
import { useBrandingContext } from '../../../../context/BrandingContext';
import { useNavigate } from 'react-router-dom';
import { getMiniature } from '../../../../utils/api';
import FavorisNotSelected from '../../../../assets/FavorisNotSelected.svg';
import { useTranslation } from 'react-i18next';
import {
  addToFavorites,
  removeFromFavorites,
  isVideoFavorite,
} from '../../../../utils/api';
import FavorisFilterSelected from '../../../../assets/FavorisFilterSelected.svg';
import ViewIcon from '../../../../assets/ViewIcon.svg';
import EditIcon from '../../../../assets/edit.svg';
import { getProfilePicture } from '../../../../utils/api';

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
  const [profilePictureUrl, setProfilePictureUrl] = useState<string>(
    DEFAULT_PERSONA_IMAGE,
  );

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
  //  const { t } = useTranslation();

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

  const handleMoreBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowAllTags(!showAllTags);
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
      {/* Top container with image and overlays */}
      <div className={styles.topContainer}>
        <img
          className={styles.imageTuileEventIcon}
          alt={props.title}
          src={props.imageSrc === undefined ? miniatureURL : props.imageSrc}
        />

        {/* Edit button */}
        {props.showEditButton && (
          <div className={styles.editContainer}>
            <img
              className={styles.editIcon}
              src={EditIcon}
              alt="Modifier"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/video/video-settings/${props.Id}`);
              }}
            />
          </div>
        )}

        {/* Star container */}
        <div className={styles.starContainer}>
          <img
            className={styles.starIcon}
            src={isFavorite ? FavorisFilterSelected : FavorisNotSelected}
            alt={isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
            onClick={toggleFavorite}
          />
        </div>

        {/* View container */}
        <div className={styles.viewsContainer}>
          <img className={styles.viewIcon} src={ViewIcon} alt="Vues" />
          <div className={styles.viewValue}>
            {props.views !== undefined ? props.views : 'No views'}
          </div>
        </div>

        {/* Time container */}
        {props.duration && (
          <div className={styles.timeContainer}>
            <div className={styles.timeValue}>
              {formatDuration(props.duration)}
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
            alt={`${props.createBy}'s profile`}
          />
        </div>

        {/* textContainer */}
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
              {`${formatNumber(dateDisplay.getDate())}/${formatNumber(
                dateDisplay.getMonth() + 1,
              )}/${dateDisplay.getFullYear()}`}
            </div>

            <div className={styles.tagsContainer}>
              {props.tags && props.tags.length > 0 && (
                <div className={styles.tagTriggerWrapper} ref={moreBadgeRef}>
                  {/* Le Popup reste le même, on affiche juste TOUS les tags dedans */}
                  {props.tags && props.tags.length > 0 && (
                    <div className={styles.tagsContainer}>
                      <button
                        className={styles.tagTriggerButton}
                        onClick={handleMoreBadgeClick}
                      >
                        <span className={styles.tagLabel}>Tags</span>
                        <span className={styles.tagCount}>
                          {props.tags.length}
                        </span>
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
                              {props.tags.map((tag, index) => (
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Thumbnail;
