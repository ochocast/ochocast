import React from 'react';
import styles from './Commentary.module.css';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../profil/ProfileDescription/ProfileDescription';

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
      <ProfileDescription
        name="Jean Dupont"
        email=""
        description=""
        image="/persona.png"
        state={ProfileDescriptionState.tiny}
      />
    </div>
  );
};

export default Commentary;
