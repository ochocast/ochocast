import React from 'react';
import styles from './PreviewMiniture.module.css';
import Tag from '../Tag/Tag';

export interface PreviewMinitureProps {
  title: string;
  imageSrc?: string;
  createBy: string;
  views: number;
  date: string;
  tags: string[];
}

const PreviewMiniture = (props: PreviewMinitureProps) => {
  return (
    <div className={styles.previewMiniture}>
      <img
        className={styles.imageTuileEventIcon}
        alt=""
        // src={props.imageSrc || process.env.DEFAULT_MINIATURE_IMAGE}
        src={props.imageSrc || '/exemple/image_tuile_event.png'}
        sizes="(max-width: 20rem) 100vw, 20rem"
      />
      <div className={styles.description}>
        <h2 className={styles.createBy}>{props.title}</h2>
        <h3 className={styles.createBy}>Créé par : {props.createBy}</h3>
        <div>
          {props.views} vues &bull; Posté le {props.date}
        </div>
        <div className={styles.tagList}>
          {props.tags.map((tag) => (
            <Tag key={tag} content={tag} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default PreviewMiniture;
