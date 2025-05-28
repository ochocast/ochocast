import React, { useState, useEffect } from 'react';
import styles from './Thumbnail.module.css';
import Tag from '../../generic/Tag/Tag';
import miniatureLogo from '../../../../assets/logo_2lignes_crop.png';
import { useNavigate } from 'react-router-dom';
import { getMiniature } from '../../../../utils/api';
import Button, { ButtonType } from '../../generic/Button/Button';
import FavorisNotSelected from '../../../../assets/FavorisNotSelected.svg';
import { useTranslation } from 'react-i18next';
import { addToFavorites, removeFromFavorites, isVideoFavorite } from '../../../../utils/api';
import FavorisFilterSelected from '../../../../assets/FavorisFilterSelected.svg';

export interface PreviewMinitureProps {
  Id: string;
  title: string;
  imageSrc?: string;
  createBy: string;
  views: number;
  createdAt: string;
  tags: string[];
  onArchived?: (id: string) => void;
}

const Thumbnail = (props: PreviewMinitureProps) => {
  const [isFavorite, setIsFavorite] = useState<boolean>(false);
  const toggleFavorite = async () => {
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

  const [miniatureURL, setMiniatureUrl] = useState<string>(
    '/exemple/image_tuile_event.png',
    // process.env.DEFAULT_MINIATURE_IMAGE
  );
  const navigate = useNavigate();
  const { t } = useTranslation();
  useEffect(() => {
    const fetchMiniatureUrl = async () => {
      if (props.Id) {
        try {
          const url = await getMiniature(props.Id);
          // TODO: rework this condition
          if (url?.data.includes('miniatureundefined')) {
            return;
          }
          setMiniatureUrl(url?.data || miniatureLogo);
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
  }, [props.Id]);

  const dateDisplay = new Date(props.createdAt); // to be able to getDay..

  function formatNumber(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
  }

  return (
    <div className={styles.previewMiniture}>
      <img
        className={styles.imageTuileEventIcon}
        alt=""
        src={props.imageSrc === undefined ? miniatureURL : props.imageSrc}
        sizes="(max-width: 20rem) 100vw, 20rem"
        onClick={() => navigate(`/video/${props.Id}`)}
      />
      <div
        className={
          props.onArchived !== undefined
            ? styles.descriptionNoButton
            : styles.description
        }
      >
        <h2
          className={styles.createBy}
          onClick={() => navigate(`/video/${props.Id}`)}
        >
          {props.title}
        </h2>
        <h3 className={styles.createBy}>
          {' '}
          {t('createdBy')} : {props.createBy}
        </h3>
        <div>
          {props.views} {t('vues')} &bull; {t('postedOn')}{' '}
          {`${formatNumber(dateDisplay.getDate())}/${formatNumber(
            dateDisplay.getMonth() + 1,
          )}/${dateDisplay.getFullYear()}`}
        </div>
        <div className={styles.tagList}>
          {props.tags &&
            props.tags.map((tag) => <Tag key={tag} content={tag} />)}
        </div>
        {props.onArchived !== undefined ? (
          <div className={styles.buttonList}>
            <Button
              type={ButtonType.secondary}
              label={t('archiveVideo')}
              onClick={() => props.onArchived!(props.Id)}
            />

            <Button
              type={ButtonType.primary}
              label={t('modifyVideo')}
              onClick={() => navigate(`/video/video-settings/${props.Id}`)}
            />
          </div>
        ) : (
          <div />
        )}
      </div>
      <img
        className={styles.starIconContainer}
        src={isFavorite ? FavorisFilterSelected : FavorisNotSelected}
        onClick={toggleFavorite}
      />
    </div>
  );
};

export default Thumbnail;
