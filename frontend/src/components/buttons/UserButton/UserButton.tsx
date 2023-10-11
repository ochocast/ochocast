import React, { FC } from 'react';
import './UserButton.css';

import userIcon from '../../../assets/UserIcon.png';

export interface HeaderUserButtonProps {}

const HeaderUserButton: FC<HeaderUserButtonProps> = () => (
  <div className="HeaderUserButton">
    <span className="TextBox">Utilisateur</span>
    <img className="IconLogo" src={userIcon} alt="IconLogo"></img>
  </div>
);

export default HeaderUserButton;
