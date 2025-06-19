import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Header.module.css';

import { useAuth } from 'react-oidc-context';
import { UserBadge } from './UserBadge/UserBadge';
import NavItems from './NavItems/NavItems';
import LanguageSwitcher from '../../../Language/LanguageSwitcher';
import { useBrandingContext } from '../../../../context/BrandingContext';

export interface HeaderProps {}

const Header: FC<HeaderProps> = () => {
  const auth = useAuth();
  const username = auth.user?.profile.given_name;
  const navigate = useNavigate();
  const branding = useBrandingContext();

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
        <div className={styles.NavBadge}>
          <NavItems />
            {username && (
          <UserBadge username={username} />
            )}
            <div className='languageSelector'>
        <LanguageSwitcher />
      </div>
        </div>
    </div>
  );
};

export default Header;
