import React, { JSX } from 'react';
import profilePicture from './profile-picture.svg';
import { useNavigate } from 'react-router-dom';
import styles from './UserBadge.module.css';

interface Props {
  username?: string;
  image?: string;
}

export const UserBadge = ({ username, image }: Props): JSX.Element => {
  // navigate to user profile
  const navigate = useNavigate();

  return (
    <div
      className={styles.userBadge}
      onClick={() => {
        navigate('/profile');
      }}
    >
      <div className={`${styles.userBadge} ${styles.userBadgeName}`}>
        {username}
      </div>
      <img
        className={`${styles.userBadge} ${styles.userBadgePicture}`}
        alt={username ? `${username}'s profile` : 'User profile'}
        src={image ? image : profilePicture}
      />
    </div>
  );
};
