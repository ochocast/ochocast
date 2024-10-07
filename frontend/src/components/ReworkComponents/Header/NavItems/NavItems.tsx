import React from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './NavItems.module.css';

const NavItems = () => {
  const navigate = useNavigate();

  return (
    <div className={styles.navItems}>
      <div className={styles.navItem}>
        <a className={styles.navItem1} onClick={() => navigate('/events')}>
          Events
        </a>
      </div>
      <div className={styles.navItem}>
        <a className={styles.navItem1} onClick={() => navigate('/videos')}>
          Videos
        </a>
      </div>
    </div>
  );
};
export default NavItems;
