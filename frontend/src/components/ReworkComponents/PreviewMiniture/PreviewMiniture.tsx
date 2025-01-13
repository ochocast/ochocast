import React, { useState, useEffect } from 'react';
import styles from './PreviewMiniture.module.css';
import Tag from '../Tag/Tag';
import miniatureLogo from '../../../assets/logo_2lignes_crop.png';
import { useNavigate } from 'react-router-dom';
import { getMiniature } from '../../../utils/api';
import HomeCardButton, {
  ButtonState,
} from '../Button/HomeCardButton/HomeCardButton';

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

const PreviewMiniture = (props: PreviewMinitureProps) => {
  const [miniatureURL, setMiniatureUrl] = useState<string>(
    '/exemple/image_tuile_event.png',
    // process.env.DEFAULT_MINIATURE_IMAGE
  );
  const navigate = useNavigate();

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

    fetchMiniatureUrl();
  }, [props.Id]);

  const dateDisplay = new Date(props.createdAt); // to be able to getDay..

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
        <h3 className={styles.createBy}>Créé par : {props.createBy}</h3>
        <div>
          {props.views} vues &bull; Posté le{' '}
          {`${dateDisplay.getDay()}/${
            dateDisplay.getMonth() + 1
          }/${dateDisplay.getFullYear()}`}
        </div>
        <div className={styles.tagList}>
          {props.tags &&
            props.tags.map((tag) => <Tag key={tag} content={tag} />)}
        </div>
        {props.onArchived !== undefined ? (
          <div className={styles.buttonList}>
            <HomeCardButton
              State={ButtonState.active}
              Title="Archiver"
              onClickFunction={() => props.onArchived!(props.Id)}
            />

            <HomeCardButton
              State={ButtonState.colored}
              Title="Modifier"
              onClickFunction={() =>
                navigate(`/video/video-settings/${props.Id}`)
              }
            />
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
};

export default PreviewMiniture;
