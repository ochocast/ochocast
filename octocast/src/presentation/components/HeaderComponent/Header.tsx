import React, { FC } from 'react';
import './Header.css';

import octoLogo from '../../assets/OctoTechnology.png'

import HeaderUserButton from './UserButtonComponent/UserButton';

interface HeaderProps {}

const Header: FC<HeaderProps> = () => (
  <div className='Header'>
    <img className='Logo' src={octoLogo} alt='Logo'></img>
    <HeaderUserButton/>
  </div>
);
export default Header;
