import React from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './NavItems.module.css';
import Button from '../../Button/Button';
import { useTranslation } from 'react-i18next';

const NavItems = () => {
  const navigate = useNavigate();
    const { t } = useTranslation();
  
  return (
    <div className={styles.navItems}>
      <div className={styles.navItem}>
        <a className={styles.navItem1} onClick={() => navigate('/events')}>
        {t('streaming')}
        </a>
      </div>
      <div className={styles.navItem}>
        <a className={styles.navItem1} onClick={() => navigate('/videos')}>
        {t('videos')}
        </a>
      </div>
      <Button
        label={t('publishVideo')}
        onClick={() => navigate('/video/video-settings')}
      />
    </div>
  );
};
export default NavItems;
