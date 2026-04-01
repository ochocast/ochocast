import React, { JSX, useState, useRef, useEffect } from 'react';
import profilePicture from './profile-picture.svg';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './UserBadge.module.css';
import LanguageSwitcher from '../../../../Language/LanguageSwitcher';
import { useUser } from '../../../../../context/UserContext';
import { getProfilePicture } from '../../../../../utils/api';

interface Props {
  username?: string;
}

export const UserBadge = ({ username }: Props): JSX.Element => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAdmin } = useUser();
  const { user } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pictureUrl, setPictureUrl] = useState<string>(profilePicture);
  const menuRef = useRef<HTMLDivElement>(null);

  // Load profile picture
  useEffect(() => {
    const fetchProfilePicture = async () => {
      try {
        if (user?.id && user?.picture_id) {
          const url = await getProfilePicture(user.id);
          if (url?.data && !url.data.includes('miniatureundefined')) {
            setPictureUrl(url.data);
          }
        }
      } catch (error) {
        console.error('Error fetching profile picture', error);
      }
    };

    fetchProfilePicture();
  }, [user?.id, user?.picture_id]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const toggleMenu = () => setMenuOpen(!menuOpen);

  return (
    <div className={styles.userBadgeContainer} ref={menuRef}>
      <div className={styles.userBadge} onClick={toggleMenu}>
        <img
          className={styles.userBadgePicture}
          alt={username ? `${username}'s profile` : 'User profile'}
          src={pictureUrl}
        />
      </div>

      {menuOpen && (
        <div className={styles.dropdown}>
          <div
            className={styles.dropdownItem}
            onClick={() => {
              navigate('/profile');
              setMenuOpen(false);
            }}
          >
            {t('profile')}
          </div>

          <hr className={styles.divider} />

          <div
            className={styles.dropdownItem}
            onClick={() => {
              navigate('/profile');
              setMenuOpen(false);
            }}
          >
            <span>{t('myVideos')}</span>
          </div>

          <div
            className={styles.dropdownItem}
            onClick={() => {
              navigate('/my-events');
              setMenuOpen(false);
            }}
          >
            <span>{t('myEvents')}</span>
          </div>

          <hr className={styles.divider} />

          {isAdmin && (
            <div
              className={styles.dropdownItem}
              onClick={() => {
                navigate('/admin');
                setMenuOpen(false);
              }}
            >
              {t('adminPanel')}
            </div>
          )}

          <div className={styles.dropdownLanguage}>
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </div>
  );
};
