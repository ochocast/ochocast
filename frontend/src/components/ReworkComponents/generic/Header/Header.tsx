import React, { FC, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Header.module.css';

import { useUser } from '../../../../context/UserContext';
import { UserBadge } from './UserBadge/UserBadge';
import NavItems from './NavItems/NavItems';
import LanguageSwitcher from '../../../Language/LanguageSwitcher';
import { useBrandingContext } from '../../../../context/BrandingContext';

export interface HeaderProps {}

const Header: FC<HeaderProps> = () => {
  const { user, isAdmin } = useUser();
  const username = user?.firstName;
  const navigate = useNavigate();
  const branding = useBrandingContext();

  const [menuOpen, setMenuOpen] = useState(false);

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const closeMenu = () => setMenuOpen(false);

  return (
    <div className={styles.Header}>
      <div className={styles.LogoDiv}>
        <img
          className={styles.Logo}
          src={branding.logo}
          alt={`${branding.appName} logo`}
          onClick={() => navigate('/')}
        />
      </div>

      {/* Desktop menu */}
      <div className={styles.NavBadge}>
        <NavItems />
        {username && <UserBadge username={username} />}
        <div className="languageSelector">
          <LanguageSwitcher />
        </div>
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
          <div
            onClick={() => {
              navigate('/events');
              closeMenu();
            }}
          >
            Streaming
          </div>
          <div
            onClick={() => {
              navigate('/videos');
              closeMenu();
            }}
          >
            Videos
          </div>
          {isAdmin && (
            <div
              onClick={() => {
                navigate('/admin');
                closeMenu();
              }}
            >
              Admin Panel
            </div>
          )}
          <div
            onClick={() => {
              navigate('/video/video-settings');
              closeMenu();
            }}
          >
            Publish a video
          </div>
          {username && (
            <div>
              <UserBadge username={username} />
            </div>
          )}
          <div className="languageSelector">
            <LanguageSwitcher />
          </div>
        </div>
      )}
    </div>
  );
};

export default Header;
