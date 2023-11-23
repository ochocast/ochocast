import React, { FC } from 'react';
import { Outlet } from 'react-router-dom';
import './Header.css';

import octoLogo from '../../assets/logo_1ligne_crop.png';

import HeaderUserButton from '../buttons/UserButton/UserButton';
import { useAuth } from 'react-oidc-context';

export interface HeaderProps {}

const Header: FC<HeaderProps> = () => {
  const auth = useAuth();
  const username = auth.user?.profile.name || 'Not logged in';
  return (
    <div className="Header">
      <img className="Logo" src={octoLogo} alt="Logo"></img>
      <HeaderUserButton username={username} />
      <Outlet />
    </div>
  );
};

export default Header;
