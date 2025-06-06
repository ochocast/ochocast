import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Header.module.css';

import octoLogo from '../../../../assets/ochoIconFull.svg';

import { useAuth } from 'react-oidc-context';
import { UserBadge } from './UserBadge/UserBadge';
import NavItems from './NavItems/NavItems';
import LanguageSwitcher from '../../../Language/LanguageSwitcher';

export interface HeaderProps {}

const Header: FC<HeaderProps> = () => {
  const auth = useAuth();
  const username = auth.user?.profile.given_name;
  const navigate = useNavigate();

  return (
    <div className={styles.Header}>
      <div className={styles.LogoDiv}>
        <img
          className={styles.Logo}
          src={octoLogo}
          alt="Logo"
          // width="200"
          // height="100"
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
