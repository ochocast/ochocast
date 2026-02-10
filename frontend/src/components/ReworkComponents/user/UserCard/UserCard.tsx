import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './UserCard.module.css';
import { getProfilePicture } from '../../../../utils/api';

interface UserCardProps {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  description: string;
  picture_id?: string;
}

const DEFAULT_PERSONA_IMAGE = '/branding/persona.png';
const MAX_DESCRIPTION_LENGTH = 100;

const UserCard: React.FC<UserCardProps> = ({
  id,
  firstName,
  lastName,
  username,
  description,
  picture_id,
}) => {
  const navigate = useNavigate();
  const [pictureUrl, setPictureUrl] = useState<string>(DEFAULT_PERSONA_IMAGE);

  useEffect(() => {
    const fetchProfilePicture = async () => {
      try {
        if (picture_id) {
          const url = await getProfilePicture(id);
          if (url?.data && !url.data.includes('miniatureundefined')) {
            setPictureUrl(url.data);
          }
        }
      } catch (error) {
        console.error('Error fetching profile picture', error);
      }
    };

    fetchProfilePicture();
  }, [id, picture_id]);

  const handleClick = () => {
    navigate(`/profile/${username}`);
  };

  const truncateDescription = (text: string) => {
    if (text.length <= MAX_DESCRIPTION_LENGTH) {
      return text;
    }
    return `${text.substring(0, MAX_DESCRIPTION_LENGTH)}... voir plus`;
  };

  return (
    <div className={styles.userCard} onClick={handleClick}>
      <div className={styles.header}>
        <img
          src={pictureUrl}
          alt={`${firstName} ${lastName}`}
          className={styles.profilePicture}
        />
        <div className={styles.nameContainer}>
          {username && <div className={styles.username}>{username}</div>}
          {!username && <div className={styles.firstName}>{firstName}</div> && (
            <div className={styles.lastName}>{lastName}</div>
          )}
        </div>
      </div>
      <div className={styles.descriptionSection}>
        <p className={styles.descriptionLabel}>Description :</p>
        <p className={styles.userDescription}>
          {truncateDescription(description || 'Aucune description')}
        </p>
      </div>
    </div>
  );
};

export default UserCard;
