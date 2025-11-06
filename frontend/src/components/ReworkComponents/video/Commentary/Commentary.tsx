import React from 'react';
import styles from './Commentary.module.css';
import ProfileDescription, {
  ProfileDescriptionState,
} from '../../profil/ProfileDescription/ProfileDescription';
import { useNavigate } from 'react-router-dom';

export interface CommentaryProps {
  content: string;
  firstname: string;
  lastname: string;
  username: string;
  email: string;
  created_at: Date;
}

const Commentary = (props: CommentaryProps) => {
  const navigate = useNavigate();

  const handleProfileClick = () => {
    navigate(`/profile/${props.username}`);
  };

  return (
    <div className={styles.commentary1}>
      <div className={styles.lesPlaceholderSontRarementParent}>
        <p className={styles.lesPlaceholderSont}>{props.content}</p>
        <div className={styles.rponses}>
          {new Date(props.created_at).toLocaleDateString('fr-FR')}
        </div>
      </div>

      <div
        className={styles.profileContainer}
        onClick={handleProfileClick}
        style={{ cursor: 'pointer' }}
        title={`Voir le profil de ${props.firstname} ${props.lastname}`}
      >
        <ProfileDescription
          firstname={props.firstname}
          lastname={props.lastname}
          username={props.username}
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
