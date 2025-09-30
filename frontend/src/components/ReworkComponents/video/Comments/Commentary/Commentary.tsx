import React from 'react';
import styles from './Commentary.module.css';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../../profil/ProfileDescription/ProfileDescription';

export interface CommentaryProps {
  content: string;
  firstname: string;
  lastname: string;
  email: string;
  created_at: Date;
}

const Commentary = (props: CommentaryProps) => {
  return (
    <div className={styles.commentary1}>
      <div className={styles.lesPlaceholderSontRarementParent}>
        <p className={styles.lesPlaceholderSont}>{props.content}</p>
        <div className={styles.rponses}>
          {new Date(props.created_at).toLocaleDateString('en-US')}
        </div>
      </div>
      <div className={styles.profileContainer}>
        <ProfileDescription
          firstname={props.firstname}
          lastname={props.lastname}
          email={props.email}
          description=""
          image=""
          state={ProfileDescriptionState.tiny}
        />
      </div>
    </div>
  );
};

export default Commentary;
