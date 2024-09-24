import React, { FC } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import './Header.css';
import Button from  "../buttons/button/button";

import octoLogo from '../../../assets/ochoIcon.svg';

import HeaderUserButton from '../Button/HeaderUserButton/HeaderUserButton';
import { useAuth } from 'react-oidc-context';

export interface HeaderProps {}

const Header: FC<HeaderProps> = () => {
  const auth = useAuth();
  const username = auth.user?.profile.name || 'Not logged in';
  const navigate = useNavigate();

  return (
    <div className="Header">
      <div className='Logo-div'>
      <img
        className="Logo"
        src={octoLogo}
        alt="Logo"
        onClick={() => navigate('/events')}
      />
      </div>
      <div className='Navigate'>
        <Button onClick={() => navigate('/events')}>Events</Button>
        <Button onClick={() => navigate('/videos')}>Videos</Button>
      </div>

      
      <HeaderUserButton username={username} />
      <Outlet />
    </div>
  );
};

export default Header;
