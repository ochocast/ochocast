import React from 'react';
import styles from './Commentary.module.css';
import ProfilDescription, {
  ProfilDescriptionState,
} from '../ProfilDescription/ProfilDescription';

export interface CommentaryProps {
  content: string;
}

const Commentary = (props: CommentaryProps) => {
  return (
    <div className={styles.commentary1}>
      <div className={styles.lesPlaceholderSontRarementParent}>
        <div className={styles.lesPlaceholderSontContainer}>
          <p className={styles.lesPlaceholderSont}>{props.content}</p>
        </div>
        <div className={styles.rponses}>6 réponses</div>
      </div>
      <ProfilDescription
        name="Jean Dupont"
        email=""
        description=""
        image="/persona.png"
        state={ProfilDescriptionState.tiny}
      />
    </div>
  );
};

export default Commentary;
