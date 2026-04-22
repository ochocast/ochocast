import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './NavItems.module.css';
import { useTranslation } from 'react-i18next';
import upload from '../../../../../assets/upload.svg';
import create from '../../../../../assets/create.svg';
import add from '../../../../../assets/add.svg';

const NavItems = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

      <div className={styles.navButtons}>
        <div className={styles.dropdownContainer} ref={menuRef}>
          <button
            className={styles.mainCreateButton}
            onClick={() => setIsOpen(!isOpen)}
          >
            <img className={styles.plusIcon} src={add} alt="+" />
            {t('Create')}
          </button>

          {isOpen && (
            <div className={styles.dropdownMenu}>
              <div
                className={styles.menuItem}
                onClick={() => {
                  navigate('/video/video-settings');
                  setIsOpen(false);
                }}
              >
                <img className={styles.menuIcon} src={upload} alt="Upload" />
                <span>{t('publishVideo')}</span>
              </div>

              <div
                className={styles.menuItem}
                onClick={() => {
                  navigate('/my-events/create');
                  setIsOpen(false);
                }}
              >
                <img className={styles.menuIcon} src={create} alt="Create" />
                <span>{t('CreateAnEvent')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NavItems;
