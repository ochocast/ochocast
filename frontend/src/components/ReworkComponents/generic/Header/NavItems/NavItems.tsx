import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import styles from './NavItems.module.css';
import { useTranslation } from 'react-i18next';
import { useUser } from '../../../../../context/UserContext';
import upload from '../../../../../assets/upload.svg';
import create from '../../../../../assets/create.svg';
import add from '../../../../../assets/add.svg';

const NavItems = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAdmin } = useUser();
  const [isOpen, setIsOpen] = useState(false);

  // 1. Création de la référence pour le conteneur du menu
  const menuRef = useRef<HTMLDivElement>(null);

  // 2. Ajout de l'écouteur d'événement pour fermer au clic à l'extérieur
  useEffect(() => {
    // 1. On précise que "event" est de type MouseEvent
    const handleClickOutside = (event: MouseEvent) => {
      // 2. On précise que event.target doit être traité comme un Node
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
        <div
          className={styles.dropdownContainer}
          ref={menuRef} /* 3. On attache la référence ici */
          /* J'ai supprimé le onClick ici qui faisait doublon avec le bouton */
        >
          {/* Bouton principal "Create" */}
          <button
            className={styles.mainCreateButton}
            onClick={() => setIsOpen(!isOpen)}
          >
            <img className={styles.plusIcon} src={add} alt="+" />
            {t('Create')}
          </button>

          {/* Menu déroulant */}
          {isOpen && (
            <div className={styles.dropdownMenu}>
              {/* Option : Upload Video */}
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

              {/* Option : Create Event */}
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
