import React, { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import './Header.css';
// import Button from '../../buttons/button/button';

import octoLogo from '../../../assets/ochoIconFull.svg';

import { useAuth } from 'react-oidc-context';
import { UserBadge } from './UserBadge/UserBadge';
import NavItems from './NavItems/NavItems';

export interface HeaderProps {}

const Header: FC<HeaderProps> = () => {
  const auth = useAuth();
  const username = auth.user?.profile.given_name;
  const navigate = useNavigate();

  return (
    <div className="Header">
      <div className="Logo-div">
        <img
          className="Logo"
          src={octoLogo}
          alt="Logo"
          // width="200"
          // height="100"
          onClick={() => navigate('/home')}
        />
      </div>
      {username && (
        <div className="NavBadge">
          <NavItems />
          <UserBadge username={username} />
        </div>
      )}
    </div>
  );
};

export default Header;
