import React, { FC, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from './Header.module.css';
import navStyles from './NavItems/NavItems.module.css';

import { useUser } from '../../../../context/UserContext';
import { UserBadge } from './UserBadge/UserBadge';
import NavItems from './NavItems/NavItems';
import Button from '../Button/Button';
import { useBrandingContext } from '../../../../context/BrandingContext';
import BrandingImage from '../../BrandingImage/BrandingImage';

export interface HeaderProps {}

const Header: FC<HeaderProps> = () => {
  const { user, isAdmin } = useUser();
  const username = user?.username || user?.firstName;
  const navigate = useNavigate();
  const { t } = useTranslation();
  const branding = useBrandingContext();

  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={styles.Header}>
      <div className={styles.LogoDiv}>
        <BrandingImage
          imageKey="logo"
          alt={`${branding.appName} logo`}
          className={styles.Logo}
          onClick={() => navigate('/')}
          fallbackSrc={`ochoIconFull.svg`}
        />
      </div>

      {/* Desktop menu */}
      <div className={styles.NavBadge}>
        <NavItems />
        {username && <UserBadge username={username} />}
      </div>

      {/* Hamburger icon for mobile */}
      <div className={styles.Hamburger} onClick={toggleMenu}>
        <div />
        <div />
        <div />
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className={styles.MobileMenu}>
          <div className={navStyles.navItem}>
            <button
              type="button"
              className={navStyles.navItem1}
              onClick={() => {
                navigate('/events-home');
                closeMenu();
              }}
            >
              {t('streaming')}
            </button>
          </div>
          <div className={navStyles.navItem}>
            <button
              type="button"
              className={navStyles.navItem1}
              onClick={() => {
                navigate('/videos');
                closeMenu();
              }}
            >
              {t('videos')}
            </button>
          </div>
          {isAdmin && (
            <div className={navStyles.navItem}>
              <button
                type="button"
                className={navStyles.navItem1}
                onClick={() => {
                  navigate('/admin');
                  closeMenu();
                }}
              >
                {t('adminPanel')}
              </button>
            </div>
          )}
          <Button
            label={t('publishVideo')}
            onClick={() => {
              navigate('/video/video-settings');
              closeMenu();
            }}
          />
          {username && <UserBadge username={username} />}
        </div>
      )}
    </div>
  );
};

export default Header;
