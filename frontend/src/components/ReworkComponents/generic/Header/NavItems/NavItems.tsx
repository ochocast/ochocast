import React from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './NavItems.module.css';
import Button from '../../Button/Button';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../../../../context/UserContext';

const NavItems = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAdmin } = useUser();
  return (
    <div className={styles.navItems}>
      <div className={styles.navItem}>
        <button
          type="button"
          className={styles.navItem1}
          onClick={() => navigate('/events-home')}
        >
          {t('streaming')}
        </button>
      </div>
      <div className={styles.navItem}>
        <button
          type="button"
          className={styles.navItem1}
          onClick={() => navigate('/videos')}
        >
          {t('videos')}
        </button>
      </div>
      {isAdmin && (
        <div className={styles.navItem}>
          <button
            type="button"
            className={styles.navItem1}
            onClick={() => navigate('/admin')}
          >
            {t('adminPanel')}
          </button>
        </div>
      )}
      <Button
        label={t('publishVideo')}
        onClick={() => navigate('/video/video-settings')}
      />
    </div>
  );
};
export default NavItems;
