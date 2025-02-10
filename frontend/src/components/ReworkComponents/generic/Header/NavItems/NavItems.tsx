import React from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './NavItems.module.css';
import Button from '../../Button/Button';

const NavItems = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.navItems}>
      <div className={styles.navItem}>
        <a
          style={{ cursor: 'not-allowed', color: '#cccccc' }}
          className={styles.navItem1}
          onClick={() => {}}
          // onClick={() => navigate('/events')}
        >
          Streaming
        </a>
      </div>
      <div className={styles.navItem}>
        <a className={styles.navItem1} onClick={() => navigate('/videos')}>
          Vidéos
        </a>
      </div>
      <Button
        label="Publier une vidéo"
        onClick={() => navigate('/video/video-settings')}
      />
    </div>
  );
};
export default NavItems;
